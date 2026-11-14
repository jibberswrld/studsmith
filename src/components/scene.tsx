"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Game } from "@/lib/project";

export default function Scene({ game, selected, onSelect }: { game: Game; selected: string | null; onSelect: (id: string | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const selectPart = useEffectEvent((id: string | null) => onSelect(id));
  const sceneRef = useRef<{ highlight: (id: string | null) => void } | null>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch {
      const message = document.createElement("p");
      message.className = "scene-error"; message.role = "status";
      message.textContent = "3D preview needs WebGL. You can still edit scripts and export to Studio.";
      element.appendChild(message);
      return () => message.remove();
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "3D scene preview. Drag to orbit, scroll to zoom.");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e5eeec");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xf3fff9, 0x61776e, 2.3));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.8);
    sun.position.set(40, 100, 30); scene.add(sun);
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const meshes: THREE.Mesh[] = [];
    for (const part of game.parts) {
      let geometry: THREE.BufferGeometry;
      if (part.kind === "ball") geometry = new THREE.SphereGeometry(0.5, 24, 16);
      else if (part.kind === "cylinder") { geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); geometry.rotateZ(Math.PI / 2); }
      else if (part.kind === "wedge") {
        geometry = new THREE.BufferGeometry();
        const points = [-.5,-.5,-.5, .5,-.5,-.5, -.5,-.5,.5, .5,-.5,-.5, .5,-.5,.5, -.5,-.5,.5, -.5,-.5,.5, .5,-.5,.5, -.5,.5,.5, .5,-.5,.5, .5,.5,.5, -.5,.5,.5, -.5,-.5,-.5, -.5,-.5,.5, -.5,.5,.5, .5,-.5,.5, .5,-.5,-.5, .5,.5,.5, .5,-.5,-.5, -.5,-.5,-.5, -.5,.5,.5, .5,-.5,-.5, -.5,.5,.5, .5,.5,.5];
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3)); geometry.computeVertexNormals();
      } else geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({ color: part.color, roughness: part.material === "Metal" ? 0.35 : 0.8, metalness: part.material === "Metal" ? 0.65 : 0, transparent: part.transparency > 0, opacity: 1 - part.transparency, emissive: part.material === "Neon" ? part.color : "#000000", emissiveIntensity: 0.2 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...part.position); mesh.scale.set(...part.size);
      mesh.rotation.set(...part.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
      mesh.userData.partId = part.id;
      group.add(mesh); meshes.push(mesh); geometries.push(geometry); materials.push(material);
    }
    scene.add(group);
    // Frame gameplay geometry; large under-world catch planes should not dominate the camera.
    const frameParts = meshes.filter((m) => Math.max(m.scale.x, m.scale.z) < 150);
    const bounds = new THREE.Box3();
    for (const mesh of frameParts.length ? frameParts : meshes) bounds.expandByObject(mesh);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z, 24) * 1.3;
    camera.position.copy(center).add(new THREE.Vector3(distance * 0.65, distance * 0.65, distance * 0.85));
    controls.target.copy(center); controls.maxDistance = distance * 10; controls.update();
    const grid = new THREE.GridHelper(Math.max(200, distance * 2), 40, 0xb0c5bc, 0xd0ded7);
    grid.position.y = bounds.min.y - 2; scene.add(grid);
    const render = () => renderer.render(scene, camera);
    sceneRef.current = { highlight: (id) => {
      meshes.forEach((mesh, index) => {
        const material = materials[index];
        const part = game.parts[index];
        material.emissive.set(part.id === id ? "#4be3a0" : part.material === "Neon" ? part.color : "#000000");
        material.emissiveIntensity = part.id === id ? 0.45 : 0.2;
      });
      render();
    } };
    const resize = new ResizeObserver(() => { const width = element.clientWidth, height = element.clientHeight; if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); });
    resize.observe(element);
    controls.addEventListener("change", render);
    let down: { x: number; y: number } | null = null;
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pointerUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
      selectPart(ray.intersectObjects(meshes)[0]?.object.userData.partId || null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointerup", pointerUp);
    render();
    return () => {
      sceneRef.current = null; resize.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp);
      geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); grid.geometry.dispose(); (grid.material as THREE.Material).dispose();
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [game.parts]);
  useEffect(() => {
    sceneRef.current?.highlight(selected);
  }, [selected, game.parts]);
  return <div className="scene-host" ref={host}><span className="scene-help">Drag to orbit · Scroll to zoom · Click to inspect</span></div>;
}
