import React, { useRef, useEffect } from 'react';

/**
 * Animated falling stickman for home screen intro
 */
const HomeStickman: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = 200;
      canvas.height = 400;
    };
    resizeCanvas();

    // Stickman state
    let y = -100;
    let umbrellaOpen = false;
    let umbrellaAnim = 0;
    let vy = 0;
    let rotation = 0;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update position
      if (umbrellaOpen) {
        vy += 0.15; // Slow fall
        if (vy > 2) vy = 2;
      } else {
        vy += 0.5; // Fast fall
        if (vy > 8) vy = 8;
        rotation += 0.1; // Spin when falling
      }

      y += vy;

      // Toggle umbrella randomly
      if (Math.random() < 0.01) {
        umbrellaOpen = !umbrellaOpen;
      }

      // Animate umbrella
      if (umbrellaOpen && umbrellaAnim < 1) {
        umbrellaAnim += 0.1;
      } else if (!umbrellaOpen && umbrellaAnim > 0) {
        umbrellaAnim -= 0.1;
      }

      // Reset when off screen
      if (y > canvas.height + 100) {
        y = -100;
        vy = 0;
        umbrellaOpen = false;
        rotation = 0;
      }

      // Draw stickman
      ctx.save();
      ctx.translate(canvas.width / 2, y);

      if (!umbrellaOpen) {
        ctx.rotate(rotation);
      }

      // Umbrella (if open)
      if (umbrellaAnim > 0) {
        const umbrellaRadius = 20 * umbrellaAnim;

        // Umbrella canopy
        ctx.beginPath();
        ctx.arc(0, -25, umbrellaRadius, 0, Math.PI, true);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.fill();

        // Umbrella handle
        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(0, -10);
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Head
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Body
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(0, 20);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Arms
      if (umbrellaOpen) {
        // Arms up holding umbrella
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(-6, -5);
        ctx.moveTo(0, 10);
        ctx.lineTo(6, -5);
      } else {
        // Arms spread out
        ctx.beginPath();
        ctx.moveTo(0, 12);
        ctx.lineTo(-10, 16);
        ctx.moveTo(0, 12);
        ctx.lineTo(10, 16);
      }
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Legs
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(-6, 32);
      ctx.moveTo(0, 20);
      ctx.lineTo(6, 32);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    };

    // Animation loop
    let animationId: number;
    const animate = () => {
      draw();
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute left-1/2 -translate-x-1/2 pointer-events-none opacity-20"
      style={{ zIndex: 1 }}
    />
  );
};

export default HomeStickman;
