<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { RotateCcw, Orbit } from '@lucide/vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const props = defineProps({ windows: { type: Array, default: () => [] }, selectedId: { type: [String, Number], default: null } })
const emit = defineEmits(['select'])
const container = ref(null)
const root = ref(null)
const sceneError = ref('')
const rotating = ref(false)
const ready = ref(false)
const labelElements = new Map()
let scene, camera, renderer, controls, observer, animationFrame, model, nodeGroup
let nodes = []
let bounds
let previousFrame = 0
let pointerStart
const projected = new THREE.Vector3()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

/** 场景仅表达服务窗口的逻辑关系，模型中的建筑位置和比例均为原创示意。 */
const materials = {
  ground: new THREE.MeshStandardMaterial({ color: 0x24363d, roughness: 0.93 }),
  paving: new THREE.MeshStandardMaterial({ color: 0x425558, roughness: 0.95 }),
  cream: new THREE.MeshStandardMaterial({ color: 0xc2c6b9, roughness: 0.79, metalness: 0.04 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x829b97, roughness: 0.87 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x304c50, roughness: 0.57, metalness: 0.16 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x243e43, roughness: 0.6, metalness: 0.35 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xa98557, roughness: 0.78 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x497f83, roughness: 0.2, metalness: 0.28, transparent: true, opacity: 0.8 }),
  light: new THREE.MeshStandardMaterial({ color: 0xf0ca88, emissive: 0xd99d48, emissiveIntensity: 0.65, roughness: 0.45 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x4a7262, roughness: 1, flatShading: true }),
  foliageLight: new THREE.MeshStandardMaterial({ color: 0x74927b, roughness: 1, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x6c6753, roughness: 1 }),
}

function box(size, position, material, parent = model) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function cylinder(radius, height, position, material, parent = model, segments = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** 生成建筑招牌纹理；所有文字与图形均在本地绘制，不加载第三方模型或图片。 */
function addSign(text, position, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 160
  const context = canvas.getContext('2d')
  context.fillStyle = '#203a3f'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#efd6a7'
  context.font = '500 72px Microsoft YaHei, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }))
  sign.position.set(...position)
  model.add(sign)
}

function addTree(x, z, scale = 1) {
  const tree = new THREE.Group()
  tree.position.set(x, 0.12, z)
  tree.scale.setScalar(scale)
  model.add(tree)
  cylinder(0.075, 0.9, [0, 0.45, 0], materials.trunk, tree)
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), materials.foliage)
  crown.scale.set(0.85, 1.1, 0.85)
  crown.position.y = 1.3
  crown.castShadow = true
  tree.add(crown)
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.43, 0), materials.foliageLight)
  top.position.set(0.08, 1.75, 0)
  top.castShadow = true
  tree.add(top)
  box([1.05, 0.15, 1.05], [0, 0.06, 0], materials.concrete, tree)
}

function addTable(x, z) {
  cylinder(0.08, 0.5, [x, 0.36, z], materials.frame)
  cylinder(0.46, 0.08, [x, 0.64, z], materials.wood, model, 24)
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3
    const px = x + Math.cos(angle) * 0.68
    const pz = z + Math.sin(angle) * 0.68
    cylinder(0.18, 0.3, [px, 0.27, pz], materials.concrete)
  }
}

/** 构建有实体材质、柔和阴影与室内暖光的食堂建筑和周边广场。 */
function createArchitecture() {
  model = new THREE.Group()
  scene.add(model)
  const stage = new THREE.Shape()
  const outline = [[-7, -4.3], [-6.5, -4.8], [6.5, -4.8], [7, -4.3], [7, 4.3], [6.5, 4.8], [-6.5, 4.8], [-7, 4.3]]
  outline.forEach(([x, y], index) => index ? stage.lineTo(x, y) : stage.moveTo(x, y))
  stage.closePath()
  const platform = new THREE.Mesh(new THREE.ExtrudeGeometry(stage, { depth: 0.24, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.05, bevelSegments: 1, steps: 1 }), materials.ground)
  platform.rotation.x = -Math.PI / 2
  platform.position.y = -0.28
  platform.receiveShadow = true
  model.add(platform)

  box([10.5, 0.15, 5.9], [0, 0.015, -0.45], materials.paving)
  box([9.8, 0.2, 4.7], [0, 0.16, -0.55], materials.concrete)
  box([9.2, 1.7, 3.45], [0, 1.12, -0.85], materials.cream)
  box([9.25, 0.25, 4.3], [0, 2.02, -0.5], materials.wood)
  box([10.15, 0.18, 5.25], [0, 2.25, -0.1], materials.roof)
  box([9.1, 0.78, 3.35], [0, 2.73, -0.7], materials.glass)
  box([9.75, 0.2, 4.1], [0, 3.2, -0.65], materials.roof)
  box([9.85, 0.065, 0.1], [0, 3.13, 1.44], materials.wood)
  box([10.0, 0.055, 0.055], [0, 2.17, 2.5], materials.light)
  // 立柱、幕墙分格和天窗形成建筑细节，避免使用整栋线框代替实体。
  for (let x = -4.45; x <= 4.5; x += 1.49) {
    box([0.09, 0.78, 0.08], [x, 2.73, 1.0], materials.frame)
    box([0.12, 2.05, 0.12], [x, 1.19, 2.25], materials.frame)
    box([0.7, 0.66, 0.035], [x, 1.2, -2.59], materials.glass)
  }
  for (let z = -1.9; z <= 0.9; z += 0.9) {
    box([0.04, 0.7, 0.6], [-4.62, 1.3, z], materials.glass)
    box([0.04, 0.7, 0.6], [4.62, 1.3, z], materials.glass)
  }
  for (let x = -2.6; x <= 2.7; x += 2.6) {
    box([1.65, 0.16, 1.4], [x, 3.39, -0.6], materials.frame)
    const skylight = box([1.5, 0.13, 1.25], [x, 3.48, -0.6], materials.glass)
    skylight.rotation.z = -0.06
  }
  addSign('禾 序  /  CAMPUS DINING', [0, 2.02, 2.55], 5.6, 0.48)
  box([2.8, 0.12, 0.6], [0, 0.06, 2.4], materials.concrete)
  box([3.2, 0.07, 0.55], [0, -0.01, 2.9], materials.paving)
  for (let x = -5.5; x <= 5.5; x += 0.75) box([0.025, 0.012, 1.5], [x, -0.001, 3.45], materials.paving)
  for (const x of [-5.7, 5.7]) {
    addTree(x, -3.1, 0.9)
    addTree(x, -0.4, 1.1)
    addTree(x, 2.5, 0.8)
    box([0.65, 0.3, 1.8], [x, 0.1, 3.9], materials.concrete)
    box([0.55, 0.28, 1.7], [x, 0.36, 3.9], materials.foliage)
  }
  addTable(-3.6, 3.5)
  addTable(3.6, 3.5)
  for (const x of [-6.4, 6.4]) for (const z of [-3.8, 3.8]) {
    cylinder(0.025, 0.55, [x, 0.22, z], materials.frame)
    cylinder(0.08, 0.1, [x, 0.55, z], materials.light)
  }
  const orbit = new THREE.Mesh(new THREE.RingGeometry(7.7, 7.72, 96), new THREE.MeshBasicMaterial({ color: 0xa58e65, side: THREE.DoubleSide, transparent: true, opacity: 0.15 }))
  orbit.rotation.x = -Math.PI / 2
  orbit.position.y = -0.37
  scene.add(orbit)
  nodeGroup = new THREE.Group()
  model.add(nodeGroup)
  bounds = new THREE.Box3().setFromObject(model)
}

/** 窗口节点按接口顺序映射到服务台；选择只影响展示，不写入业务数据。 */
function updateWindowNodes() {
  if (!nodeGroup) return
  disposeTree(nodeGroup)
  nodeGroup.clear()
  nodes = []
  const count = props.windows.length
  const spacing = Math.min(2.8, 8.0 / Math.max(count, 1))
  const counterWidth = Math.min(2.3, spacing * 0.83)
  props.windows.forEach((window, index) => {
    const x = (index - (count - 1) / 2) * spacing
    const statusColor = Number(window.ready) > 0 ? 0xe8ac69 : Number(window.pending) + Number(window.preparing) > 0 ? 0x72c9b6 : 0x8eaa8f
    const group = new THREE.Group()
    group.position.set(x, 0, 1.86)
    group.userData.windowId = window.id
    nodeGroup.add(group)
    box([counterWidth, 0.67, 0.62], [0, 0.6, 0], materials.wood.clone(), group)
    box([counterWidth + 0.1, 0.08, 0.78], [0, 0.98, 0], materials.cream.clone(), group)
    box([counterWidth - 0.1, 0.65, 0.06], [0, 1.46, -0.42], materials.glass.clone(), group)
    const glowMaterial = new THREE.MeshStandardMaterial({ color: statusColor, emissive: statusColor, emissiveIntensity: 0.65, roughness: 0.3 })
    box([counterWidth - 0.25, 0.035, 0.05], [0, 1.83, -0.35], glowMaterial, group)
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), glowMaterial)
    marker.position.set(0, 2.64, 0.1)
    group.add(marker)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 28), new THREE.MeshBasicMaterial({ color: statusColor, transparent: true, opacity: 0.6 }))
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(marker.position)
    group.add(ring)
    nodes.push({ id: window.id, marker, ring, glowMaterial, statusColor, anchor: new THREE.Vector3(x, 3.12, 1.96), phase: index * 0.8 })
  })
  updateSelection()
}

function updateSelection() {
  nodes.forEach(node => {
    const selected = node.id === props.selectedId
    node.glowMaterial.color.set(selected ? 0xffc17c : node.statusColor)
    node.glowMaterial.emissive.set(selected ? 0xeaa255 : node.statusColor)
    node.glowMaterial.emissiveIntensity = selected ? 1.1 : 0.4
    node.ring.material.color.set(selected ? 0xf3c485 : node.statusColor)
  })
}

function setLabel(element, id) {
  if (element) labelElements.set(id, element)
  else labelElements.delete(id)
}

/** 将节点标注投影到画布，窄屏时均匀排布，避免标签互相覆盖。 */
function projectLabels() {
  if (!camera || !root.value) return
  const width = root.value.clientWidth
  const height = root.value.clientHeight
  const placements = nodes.map(node => {
    projected.copy(node.anchor).project(camera)
    const element = labelElements.get(node.id)
    const half = (element?.offsetWidth || 100) / 2
    return { element, x: Math.max(half + 2, Math.min(width - half - 2, (projected.x + 1) * width / 2)), y: Math.max(62, Math.min(height - 46, (-projected.y + 1) * height / 2 - 10)), half }
  }).sort((a, b) => a.x - b.x)
  const overlapping = placements.some((item, index) => index && item.x - placements[index - 1].x < item.half + placements[index - 1].half + 6)
  placements.forEach((item, index) => {
    if (!item.element) return
    const x = overlapping ? (index + 0.5) * width / Math.max(placements.length, 1) : item.x
    item.element.style.left = `${x}px`
    item.element.style.top = `${item.y}px`
  })
}

/** 正交相机按实体建筑包围盒适配画布，让场景持续占据中央舞台。 */
function resizeScene() {
  if (!container.value || !renderer || !camera || !bounds) return
  const width = container.value.clientWidth
  const height = container.value.clientHeight
  if (!width || !height) return
  const aspect = width / height
  camera.updateMatrixWorld()
  const points = []
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse))
  const projectedBounds = new THREE.Box3().setFromPoints(points)
  const projectedSize = projectedBounds.getSize(new THREE.Vector3())
  const viewHeight = Math.max(projectedSize.y * 1.08, projectedSize.x / aspect * 1.06)
  camera.left = -viewHeight * aspect / 2
  camera.right = viewHeight * aspect / 2
  camera.top = viewHeight / 2
  camera.bottom = -viewHeight / 2
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}

function toggleRotation() {
  rotating.value = !rotating.value
  if (controls) controls.autoRotate = rotating.value
}
function resetView() { controls?.reset(); rotating.value = false; if (controls) controls.autoRotate = false; resizeScene() }
function pointerDown(event) { pointerStart = { x: event.clientX, y: event.clientY } }
function pointerUp(event) {
  if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(nodeGroup.children, true)[0]
  if (!hit) return
  let target = hit.object
  while (target && target.userData.windowId == null) target = target.parent
  if (target) emit('select', target.userData.windowId)
}

function animate(now = 0) {
  animationFrame = requestAnimationFrame(animate)
  const delta = previousFrame ? Math.min((now - previousFrame) / 1000, 0.1) : 0
  previousFrame = now
  controls?.update(delta)
  nodes.forEach(node => {
    const pulse = (Math.sin(now * 0.0017 + node.phase) + 1) / 2
    node.ring.scale.setScalar(0.9 + pulse * 0.35)
    node.ring.material.opacity = node.id === props.selectedId ? 0.65 : 0.25 + pulse * 0.2
  })
  renderer?.render(scene, camera)
  projectLabels()
}

/** 统一释放几何体、材质与文字纹理，避免刷新或离开页面后保留 GPU 资源。 */
function disposeTree(parent) {
  const geometries = new Set()
  const resources = new Set()
  parent?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    object.shadow?.dispose()
    const entries = Array.isArray(object.material) ? object.material : [object.material]
    entries.filter(Boolean).forEach(material => { if (material.map) resources.add(material.map); resources.add(material) })
  })
  geometries.forEach(geometry => geometry.dispose())
  resources.forEach(resource => resource.dispose())
}

function initializeScene() {
  try {
    scene = new THREE.Scene()
    camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 120)
    camera.position.set(13.5, 11.5, 16.5)
    camera.lookAt(0, 1.0, 0)
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.value.appendChild(renderer.domElement)
    scene.add(new THREE.HemisphereLight(0xd4e8df, 0x27363b, 2.1))
    const sun = new THREE.DirectionalLight(0xffe1b3, 3.2)
    sun.position.set(-5, 12, 9)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 10, bottom: -10, near: 0.1, far: 40 })
    sun.shadow.camera.updateProjectionMatrix()
    sun.shadow.bias = -0.0005
    sun.shadow.normalBias = 0.035
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0x8ac6cf, 1.1)
    fill.position.set(5, 6, -8)
    scene.add(fill)
    createArchitecture()
    updateWindowNodes()
    controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.0, 0)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minZoom = 0.72
    controls.maxZoom = 1.65
    controls.minPolarAngle = Math.PI * 0.15
    controls.maxPolarAngle = Math.PI * 0.43
    controls.autoRotateSpeed = 0.3
    controls.update()
    controls.saveState()
    renderer.domElement.addEventListener('pointerdown', pointerDown)
    renderer.domElement.addEventListener('pointerup', pointerUp)
    observer = new ResizeObserver(resizeScene)
    observer.observe(container.value)
    resizeScene()
    animate()
    ready.value = true
  } catch {
    sceneError.value = '三维画面暂不可用，窗口运营数据仍可查看。'
  }
}

watch(() => props.windows, updateWindowNodes, { deep: true })
watch(() => props.selectedId, updateSelection)
onMounted(initializeScene)
onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
  observer?.disconnect()
  controls?.dispose()
  renderer?.domElement.removeEventListener('pointerdown', pointerDown)
  renderer?.domElement.removeEventListener('pointerup', pointerUp)
  disposeTree(scene)
  renderer?.dispose()
  renderer?.domElement.remove()
  labelElements.clear()
})
</script>

<template>
  <section ref="root" class="screen-scene" :data-ready="ready" aria-label="食堂服务窗口三维运营示意，可拖动旋转并选择窗口">
    <div ref="container" class="screen-scene-canvas" aria-hidden="true" />
    <button v-for="(window, index) in windows" :key="window.id" :ref="element => setLabel(element, window.id)" class="screen-scene-label" :class="{ selected: window.id === selectedId }" :aria-pressed="window.id === selectedId" @click="emit('select', window.id)"><i class="scene-label-index">{{ String(index + 1).padStart(2, '0') }}</i><span><small>{{ window.name }}</small><b>{{ window.reservations }}<em>笔预约</em></b></span></button>
    <p v-if="sceneError" class="screen-scene-error">{{ sceneError }}</p>
    <span class="screen-scene-caption">运营沙盘 · 示意布局</span>
    <div class="screen-scene-tools"><button :class="{ active: rotating }" @click="toggleRotation"><Orbit :size="12" />{{ rotating ? '停止巡航' : '场景巡航' }}</button><button @click="resetView"><RotateCcw :size="12" />复位</button></div>
  </section>
</template>
