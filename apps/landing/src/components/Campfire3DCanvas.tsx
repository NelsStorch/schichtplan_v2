'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number; // 0.2 (distant/small) to 2.5 (close/large)
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
  maxOpacity: number;
  hue: number; // 25 (deep amber/red) to 48 (golden fire)
  wobble: number;
  wobbleSpeed: number;
}

export function Campfire3DCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let animationFrameId: number;
    let width = canvas.parentElement?.clientWidth || window.innerWidth;
    let height = canvas.parentElement?.clientHeight || window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const handleResize = () => {
      if (!canvas?.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / height - 0.5) * 2;
      mouseRef.current.targetX = nx;
      mouseRef.current.targetY = ny;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Spawn initial particles
    const particleCount = 55;
    const particles: Particle[] = [];

    const createParticle = (spawnRandomY = false): Particle => {
      const z = 0.3 + Math.random() * 2.0;
      return {
        x: Math.random() * width,
        y: spawnRandomY ? Math.random() * height : height + Math.random() * 50,
        z,
        size: (1.2 + Math.random() * 2.4) * z,
        speedY: (0.4 + Math.random() * 1.3) * (0.8 + z * 0.5),
        speedX: (Math.random() - 0.5) * 0.6,
        opacity: 0,
        maxOpacity: 0.25 + Math.random() * 0.65,
        hue: 20 + Math.random() * 28, // Warm ember palette
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.015 + Math.random() * 0.03,
      };
    };

    for (let i = 0; i < particleCount; i++) {
      particles.push(createParticle(true));
    }

    let isVisible = true;
    let isRunning = false;

    const startLoop = () => {
      if (!isRunning) {
        isRunning = true;
        animationFrameId = requestAnimationFrame(render);
      }
    };

    const stopLoop = () => {
      isRunning = false;
      cancelAnimationFrame(animationFrameId);
    };

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting && !document.hidden;
      if (isVisible) {
        startLoop();
      } else {
        stopLoop();
      }
    });
    observer.observe(canvas);

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        startLoop();
      } else {
        stopLoop();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const render = () => {
      if (!isVisible) {
        isRunning = false;
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Smooth mouse interpolation for 3D parallax wind
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;
      const windX = mouseRef.current.x * 0.8;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.wobble += p.wobbleSpeed;
        p.y -= p.speedY;
        p.x += p.speedX + Math.sin(p.wobble) * 0.6 + windX * p.z;

        // Fade in when entering from bottom, fade out towards the top
        const progress = 1 - p.y / height;
        if (progress < 0.2) {
          p.opacity = (progress / 0.2) * p.maxOpacity;
        } else if (progress > 0.8) {
          p.opacity = ((1 - progress) / 0.2) * p.maxOpacity;
        } else {
          p.opacity = p.maxOpacity;
        }

        // Reset if particle floats past top or sides
        if (p.y < -20 || p.x < -30 || p.x > width + 30) {
          particles[i] = createParticle(false);
          continue;
        }

        // Render 3D ember spark with depth-based glow
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity));
        
        // Ember core
        ctx.fillStyle = `hsl(${p.hue}, 95%, ${60 + p.z * 10}%)`;
        ctx.shadowColor = `hsl(${p.hue}, 100%, 55%)`;
        ctx.shadowBlur = 8 * p.z;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Extra white-hot center for close embers
        if (p.z > 1.4) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-80"
      aria-hidden="true"
    />
  );
}
