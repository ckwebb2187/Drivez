import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { CAR_MODELS } from '@/lib/carModels';

// Turntable view of your car in the garage: slowly spins, drag to turn it.
// `look` = { display, shape, wheels, wheelColor, scoop, wing, paint, glow, model3d, image, modelPaint }
export default function CarPreview3D({ look, height = 220 }) {
  const box = useRef(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(look);

  useEffect(() => {
    let alive = true, raf = 0, renderer, cleanup = () => {};
    setLoading(true); setFailed(false);
    (async () => {
      try {
        const THREE = await import('three');
        const car3d = await import('@/lib/car3d');
        if (!alive || !box.current) return;
        const w = box.current.clientWidth, h = height;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(w, h);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        box.current.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
        scene.add(new THREE.HemisphereLight('#dfe8ff', '#20242c', 1.4));
        const sun = new THREE.DirectionalLight('#ffffff', 2.4); sun.position.set(-4, 7, 3); scene.add(sun);
        const rim = new THREE.DirectionalLight('#8fb2ff', 1.2); rim.position.set(5, 3, -5); scene.add(rim);
        // Floor: dark disc that fades out at the edges.
        const fc = document.createElement('canvas'); fc.width = fc.height = 256;
        const fg = fc.getContext('2d'); const grd = fg.createRadialGradient(128, 128, 10, 128, 128, 128);
        grd.addColorStop(0, 'rgba(60,66,80,0.9)'); grd.addColorStop(1, 'rgba(10,12,16,0)');
        fg.fillStyle = grd; fg.fillRect(0, 0, 256, 256);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, depthWrite: false }));
        floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005; scene.add(floor);

        let car;
        const glow = look.glow || null;
        const model = look.display === 'model' && look.model3d && CAR_MODELS[look.model3d];
        if (model) {
          car = await car3d.buildModelCar({ url: model.url, paint: look.modelPaint || null, glow, frontAxis: model.frontAxis, paintMaterials: model.paintMaterials });
        } else if (look.display === 'picture' && look.image) {
          const pic = await car3d.prepareCarPicture(look.image);
          car = car3d.buildPictureCar({ ...pic, glow: look.glow !== undefined ? look.glow : pic.glow });
        } else {
          car = car3d.buildCar({ body: look.paint, glow, shape: look.shape, wheels: look.wheels, wheelColor: look.wheelColor, scoop: look.scoop, wing: look.wing });
        }
        if (!alive) return;
        scene.add(car);

        // Spin + drag to turn.
        let angle = -0.6, drag = null, idleAt = 0;
        const el = renderer.domElement;
        el.style.touchAction = 'pan-y';
        const down = (e) => { drag = { x: e.clientX, a: angle }; };
        const move = (e) => { if (drag) { angle = drag.a + (e.clientX - drag.x) * 0.012; idleAt = performance.now(); } };
        const up = () => { drag = null; idleAt = performance.now(); };
        el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        const onResize = () => { const nw = box.current?.clientWidth || w; renderer.setSize(nw, h); camera.aspect = nw / h; camera.updateProjectionMatrix(); };
        window.addEventListener('resize', onResize);
        cleanup = () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('resize', onResize); };

        setLoading(false);
        const tick = (t) => {
          raf = requestAnimationFrame(tick);
          if (!drag && t - idleAt > 1500) angle += 0.006;
          const r = 8.2;
          camera.position.set(Math.sin(angle) * r, 2.6, Math.cos(angle) * r);
          camera.lookAt(0, 0.55, 0);
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        console.warn('Car preview failed', e);
        if (alive) { setFailed(true); setLoading(false); }
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      cleanup();
      if (renderer) { renderer.dispose(); renderer.domElement.remove(); }
    };
  }, [key, height]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box} className="relative w-full rounded-2xl overflow-hidden" style={{ height, background: 'radial-gradient(120% 90% at 50% 20%, #232838 0%, #0d0f15 70%)' }}>
      {loading && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
      {failed && <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">3D preview isn't available on this device</div>}
      {!loading && !failed && <div className="absolute bottom-2 right-3 text-[10px] text-white/50 flex items-center gap-1 pointer-events-none"><RotateCw className="w-3 h-3" />Drag to turn</div>}
    </div>
  );
}
