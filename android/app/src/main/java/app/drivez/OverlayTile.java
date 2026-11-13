package app.drivez;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

// Quick-settings tile: turn Overlay Mode on or off without opening Kaido.
public class OverlayTile extends TileService {
    @Override
    public void onStartListening() { refresh(); }

    @Override
    public void onClick() {
        if (OverlayService.isRunning()) { OverlayService.stop(this); refresh(); return; }
        Intent go;
        if (!Settings.canDrawOverlays(this)) {
            go = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); // grant "Display over other apps" from Kaido
        } else {
            go = OverlayService.wazeIntent(this);
            if (go == null) go = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            else startForegroundService(new Intent(this, OverlayService.class));
        }
        collapseAndOpen(go);
        refresh();
    }

    @SuppressWarnings("deprecation")
    private void collapseAndOpen(Intent i) {
        try {
            if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            else startActivityAndCollapse(i);
        } catch (Exception ignored) { }
    }

    private void refresh() {
        Tile t = getQsTile();
        if (t == null) return;
        t.setState(OverlayService.isRunning() ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.setLabel("Kaido overlay");
        t.updateTile();
    }
}
