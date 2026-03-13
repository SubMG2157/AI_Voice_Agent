import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  inputVolume: number; // 0-255
  outputVolume: number; // 0-255
  isConnected: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ inputVolume, outputVolume, isConnected }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Base circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
      ctx.fillStyle = isConnected ? '#1e293b' : '#334155';
      ctx.fill();

      if (isConnected) {
        // Customer Ring (Input) - Navy Blue
        const userRadius = 50 + (inputVolume / 255) * 80;
        ctx.beginPath();
        ctx.arc(centerX, centerY, userRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 51, 102, ${Math.min(0.9, inputVolume / 80 + 0.3)})`; // Navy
        ctx.lineWidth = 4;
        ctx.stroke();

        // Agent Ring (Output) - Amber/Gold
        const aiRadius = 45 + (outputVolume / 255) * 100;
        ctx.beginPath();
        ctx.arc(centerX, centerY, aiRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(245, 158, 11, ${Math.min(0.9, outputVolume / 80 + 0.3)})`; // Amber
        ctx.lineWidth = 4;
        ctx.stroke();

        // Inner glowing core - Gold accent
        ctx.beginPath();
        ctx.arc(centerX, centerY, 10 + (outputVolume / 255) * 20, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [inputVolume, outputVolume, isConnected]);

  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      <canvas 
        ref={canvasRef} 
        width={300} 
        height={300} 
        className="absolute top-0 left-0 w-full h-full"
      />
      {!isConnected && (
        <div className="absolute text-slate-400 text-sm font-medium z-10">
          Ready to Call
        </div>
      )}
    </div>
  );
};

export default Visualizer;
