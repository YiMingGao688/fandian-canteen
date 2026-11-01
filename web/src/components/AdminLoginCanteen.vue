<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'

const host = ref(null)
const ready = ref(false)
let renderer
let scene
let camera
let building
let observer
let frameId
let lastFrame = 0
let reducedMotion = false
let contextLost = false
let motionPreference

/** 在本地构建轻量食堂模型，作为登录页氛围背景，不承载业务数据或交互。 */
function buildBuilding() {
  const root = new THREE.Group()
  const materials = {
    plinth: new THREE.MeshStandardMaterial({ color: 0x31493a, roughness: 0.92 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xb6bbaa, roughness: 0.86 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x536c56, roughness: 0.72 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x304b3a, roughness: 0.54, metalness: 0.12 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8aa89a, roughness: 0.27, metalness: 0.08, transparent: true, opacity: 0.72 }),
    warm: new THREE.MeshStandardMaterial({ color: 0xd5b77b, emissive: 0x946d32, emissiveIntensity: 0.38, roughness: 0.56 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x65836a, roughness: 1, flatShading: true }),
  }

  const addBox = (size, position, material, parent = root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...position)
    mesh.castShadow = false
    mesh.receiveShadow = false
    parent.add(mesh)
    return mesh
  }

  addBox([10.4, 0.26, 6.5], [0, -0.22, 0], materials.plinth)
  addBox([8.2, 1.72, 4.2], [0, 0.72, -0.15], materials.wall)
  addBox([8.55, 0.2, 4.65], [0, 1.65, -0.1], materials.roof)
  addBox([8.7, 0.16, 4.78], [0, 1.82, -0.08], materials.frame)
  addBox([7.8, 0.68, 3.92], [0, 2.15, -0.12], materials.roof)

  // 玻璃幕墙、细立柱和暖色门厅灯延续大屏示意建筑的材质语言。
  addBox([7.55, 0.92, 0.08], [0, 0.95, 2.0], materials.glass)
  for (let x = -3.45; x <= 3.46; x += 1.15) {
    addBox([0.075, 1.08, 0.11], [x, 0.95, 2.03], materials.frame)
  }
  addBox([2.8, 0.14, 0.66], [0, 0.12, 2.22], materials.roof)
  addBox([3.3, 0.07, 0.08], [0, 1.56, 2.05], materials.warm)
  addBox([3.1, 0.08, 0.5], [0, 1.94, 2.05], materials.frame)

  for (const x of [-4.65, 4.65]) {
    const tree = new THREE.Group()
    tree.position.set(x, -0.08, 0.7)
    root.add(tree)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.74, 7), materials.frame)
    trunk.position.y = 0.34
    tree.add(trunk)
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 1), materials.leaf)
    crown.position.y = 0.98
    crown.scale.set(0.88, 1.12, 0.88)
    tree.add(crown)
  }

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(5.95, 6.0, 96),
    new THREE.MeshBasicMaterial({ color: 0xc9b57f, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.y = -0.34
  root.add(halo)
  return { root, warmMaterial: materials.warm }
}

function renderFrame(now = 0) {
  frameId = 0
  if (!renderer || document.hidden || contextLost) return
  if (now - lastFrame >= 1000 / 30 || !lastFrame) {
    lastFrame = now
    if (building && !reducedMotion) {
      building.root.rotation.y = now * 0.00024
      building.root.position.y = Math.sin(now * 0.0012) * 0.05
      building.warmMaterial.emissiveIntensity = 0.34 + (Math.sin(now * 0.001) + 1) * 0.055
    }
    renderer.render(scene, camera)
  }
  if (!reducedMotion) frameId = requestAnimationFrame(renderFrame)
}

function resize() {
  if (!host.value || !renderer || !camera) return
  const width = host.value.clientWidth
  const height = host.value.clientHeight
  if (!width || !height) return
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
  if (reducedMotion) renderer.render(scene, camera)
}

function setReducedMotion(event) {
  reducedMotion = event.matches
  cancelAnimationFrame(frameId)
  frameId = 0
  if (reducedMotion) renderer?.render(scene, camera)
  else renderFrame()
}

function setVisibility() {
  cancelAnimationFrame(frameId)
  frameId = 0
  if (!document.hidden && !reducedMotion) renderFrame()
}

function handleContextLost(event) {
  event.preventDefault()
  contextLost = true
  cancelAnimationFrame(frameId)
  frameId = 0
  ready.value = false
}

function handleContextRestored() {
  contextLost = false
  ready.value = true
  renderFrame()
}

function dispose() {
  cancelAnimationFrame(frameId)
  observer?.disconnect()
  document.removeEventListener('visibilitychange', setVisibility)
  motionPreference?.removeEventListener('change', setReducedMotion)
  renderer?.domElement.removeEventListener('webglcontextlost', handleContextLost)
  renderer?.domElement.removeEventListener('webglcontextrestored', handleContextRestored)
  scene?.traverse(object => {
    object.geometry?.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.filter(Boolean).forEach(material => material.dispose())
  })
  renderer?.dispose()
  renderer?.domElement.remove()
}

function initialize() {
  try {
    motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion = motionPreference.matches
    motionPreference.addEventListener('change', setReducedMotion)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80)
    camera.position.set(10.5, 7.2, 13.5)
    camera.lookAt(0, 0.95, 0)
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.setAttribute('aria-hidden', 'true')
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored)
    host.value.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xe4ead7, 0x2d4232, 2.0))
    const keyLight = new THREE.DirectionalLight(0xffdfaa, 2.6)
    keyLight.position.set(-5, 10, 8)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0x9fbda3, 1.0)
    fillLight.position.set(6, 5, -7)
    scene.add(fillLight)

    building = buildBuilding()
    scene.add(building.root)
    observer = new ResizeObserver(resize)
    observer.observe(host.value)
    document.addEventListener('visibilitychange', setVisibility)
    resize()
    ready.value = true
    renderFrame()
  } catch {
    // 保留 SVG 线稿作为 WebGL 不可用时的静态背景。
    dispose()
  }
}

onMounted(initialize)
onUnmounted(dispose)
</script>

<template>
  <div ref="host" class="admin-login-canteen" :data-ready="ready" aria-hidden="true" />
</template>
