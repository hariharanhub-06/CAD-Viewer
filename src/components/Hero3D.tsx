"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// A lightweight, colorful rotating 3D element used on marketing / auth pages.
// Uses MeshNormalMaterial so it's vivid with no lighting setup, plus a wireframe shell.
export function Hero3D({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    const w = mount.clientWidth || 400;
    const h = mount.clientHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.5, 0.45, 180, 32),
      new THREE.MeshNormalMaterial({ flatShading: true })
    );
    scene.add(knot);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.6, 1),
      new THREE.MeshBasicMaterial({ color: 0x8b5cf6, wireframe: true, transparent: true, opacity: 0.15 })
    );
    scene.add(shell);

    // a few floating colored dots
    const dotColors = [0x22d3ee, 0xd946ef, 0xf59e0b, 0x10b981];
    const dots: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshBasicMaterial({ color: dotColors[i] })
      );
      const a = (i / 4) * Math.PI * 2;
      dot.position.set(Math.cos(a) * 3, Math.sin(a) * 2.2, Math.sin(a) * 1.5);
      scene.add(dot);
      dots.push(dot);
    }

    let raf = 0;
    let t = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      t += 0.005;
      knot.rotation.x += 0.006;
      knot.rotation.y += 0.009;
      shell.rotation.y -= 0.003;
      shell.rotation.x += 0.002;
      dots.forEach((d, i) => {
        const a = t + (i / 4) * Math.PI * 2;
        d.position.set(Math.cos(a) * 3, Math.sin(a * 1.3) * 2.2, Math.sin(a) * 1.5);
      });
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className={className} />;
}
