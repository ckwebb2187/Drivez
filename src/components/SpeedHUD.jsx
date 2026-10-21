import { motion } from 'framer-motion';

export default function SpeedHUD({ speed, maxSpeed = 0 }) {
  const displaySpeed = Math.round(speed);
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex items-baseline gap-1">
        <motion.span
          key={displaySpeed}
          initial={{ opacity: 0.5, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="speed-font text-[88px] font-bold leading-none text-primary"
          style={{ textShadow: '0 0 30px rgba(0, 191, 255, 0.4)' }}
        >
          {displaySpeed}
        </motion.span>
        <span className="speed-font text-lg font-medium text-muted-foreground mb-2">mph</span>
      </div>
      {maxSpeed > 0 && (
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-1 h-1 rounded-full bg-accent" />
          <span className="text-xs text-muted-foreground">Peak {Math.round(maxSpeed)} mph</span>
        </div>
      )}
    </div>
  );
}
