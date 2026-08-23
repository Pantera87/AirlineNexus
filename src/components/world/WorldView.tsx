import { Canvas, useFrame } from '@react-three/fiber'
import { Stars, Line, useTexture, OrbitControls } from '@react-three/drei'
import { useRef, useMemo } from 'react'
import { ShaderMaterial, Vector3, Mesh, Group, DirectionalLight } from 'three'
import { useGameStore } from '@/store/gameStore'
import type { Aircraft, Route, Airport } from '@/types/game'
import { AIRPORT_DATABASE } from '@/data/airports'
import earthVertShader from '@/shaders/earthDayNight.vert?raw'
import earthFragShader from '@/shaders/earthDayNight.frag?raw'

const GLOBE_RADIUS = 45
const SUN_DISTANCE = 200
const AXIAL_TILT_BASE = 23.44 * (Math.PI / 180) // 23.44 degrees in radians

// Convert lat/lon to 3D position on the globe surface
function latLonToPosition(lat: number, lon: number, radius: number = GLOBE_RADIUS): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  
  const x = radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  
  return [x, y, z]
}

// Get day of year (1-365)
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  return Math.floor(diff / oneDay)
}

// Calculate seasonal axial tilt based on day of year
// Earth's tilt relative to sun varies throughout the year
// Summer solstice (day ~172): northern hemisphere tilted toward sun
// Winter solstice (day ~355): northern hemisphere tilted away from sun
function getSeasonalAxialTilt(dayOfYear: number): number {
  // The tilt angle relative to the sun direction varies sinusoidally
  // Offset by ~80 days so that day 0 (Jan 1) is near winter solstice position
  return AXIAL_TILT_BASE * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365)
}

// Calculate Earth's rotation angle based on time of day
// At 00:00 UTC, prime meridian faces away from sun (on the night side)
// At 12:00 UTC, prime meridian faces toward sun (on the day side)
function getEarthRotationAngle(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  // Earth rotates 360 degrees in 24 hours
  // At noon (12:00), rotation should align prime meridian with sun (facing +X)
  return ((hours - 12) / 24) * 2 * Math.PI
}

// Calculate the sun's orbit angle in world space from game time.
// The Sun is fixed while Earth rotates beneath it, so this gives a stable position.
function getSunOrbitAngle(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  return ((hours - 12) / 24) * 2 * Math.PI
}

// Calculate the solar declination for a given day of year.
// This is the angle between the sun direction and Earth's equatorial plane.
// At summer solstice (day ~172): +23.44° (sun above equator)
// At winter solstice (day ~355/0): -23.44° (sun below equator)
function getSolarDeclination(dayOfYear: number): number {
  return AXIAL_TILT_BASE * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365)
}

// Sun component with bloom-like glow that orbits around Earth based on game time
function Sun({ lightRef }: { lightRef: React.RefObject<DirectionalLight | null> }) {
  const groupRef = useRef<Group>(null)
  const currentDate = useGameStore(state => state.currentDate)
  const gameSpeed = useGameStore(state => state.gameSpeed)

  // Continuous accumulator for fluid motion - advances by delta, never snaps to discrete date ticks
  const accumulatedAngleRef = useRef<number>(getSunOrbitAngle(new Date(currentDate)))
  const lastDateRef = useRef<Date>(new Date(currentDate))

  const getSpeedMultiplier = (speed: string): number => {
    switch (speed) {
      case 'paused': return 0
      case 'normal': return 1      // 1 game second per real second
      case 'fast': return 60       // 1 game minute per real second
      case 'fastest': return 3600  // 1 game hour per real second
      default: return 0
    }
  }

  useFrame((_state, delta) => {
    if (!groupRef.current) return

    const speedMultiplier = getSpeedMultiplier(gameSpeed)

    // Detect user time jumps and snap accumulator to match new target angle
    const dateDiff = currentDate.getTime() - lastDateRef.current.getTime()
    if (Math.abs(dateDiff) > 3600 * 1000) {
      accumulatedAngleRef.current = getSunOrbitAngle(currentDate)
    }
    lastDateRef.current = new Date(currentDate)

    // Sun orbits at same angular rate as Earth rotates (2π per 86400 game seconds)
    const orbitSpeed = (2 * Math.PI) / 86400
    accumulatedAngleRef.current += orbitSpeed * speedMultiplier * delta

    // Include seasonal solar declination so sun is above/below the equator depending on time of year.
    const dayOfYear = getDayOfYear(currentDate)
    const declination = getSolarDeclination(dayOfYear)

    const x = SUN_DISTANCE * Math.cos(accumulatedAngleRef.current)
    const y = SUN_DISTANCE * Math.sin(declination)
    const z = SUN_DISTANCE * Math.sin(accumulatedAngleRef.current)

    groupRef.current.position.set(x, y, z)

    // Sync directional light position with sun
    if (lightRef.current) {
      lightRef.current.position.set(x, y, z)
    }
  })
  
  return (
    <group ref={groupRef}>
      {/* Core sun sphere - bright white-yellow */}
      <mesh>
        <sphereGeometry args={[2, 32, 32]} />
        <meshBasicMaterial color="#fff8e0" />
      </mesh>
      {/* Inner glow layer */}
      <mesh>
        <sphereGeometry args={[4, 32, 32]} />
        <meshBasicMaterial color="#ffdd44" transparent opacity={0.4} />
      </mesh>
      {/* Middle glow layer */}
      <mesh>
        <sphereGeometry args={[8, 32, 32]} />
        <meshBasicMaterial color="#ffaa00" transparent opacity={0.15} />
      </mesh>
      {/* Outer glow layer */}
      <mesh>
        <sphereGeometry args={[15, 32, 32]} />
        <meshBasicMaterial color="#ff8800" transparent opacity={0.05} />
      </mesh>
    </group>
  )
}

// Earth component with day/night shader
function Earth() {
  const meshRef = useRef<Mesh>(null)
  const currentDate = useGameStore(state => state.currentDate)
  const gameSpeed = useGameStore(state => state.gameSpeed)

  // Continuous rotation accumulator - never resets, no jerks
  const accumulatedRotationRef = useRef<number>(getEarthRotationAngle(new Date(currentDate)))
  const lastDateRef = useRef<Date>(new Date(currentDate))

  // Smooth sun angle for shader so shadows move continuously instead of snapping to discrete ticks.
  const accumulatedSunAngleRef = useRef<number>(getSunOrbitAngle(new Date(currentDate)))

  const [dayTexture, nightTexture] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg'
  ])
  
  // Create shader material
  const shaderMaterial = useMemo(() => {
    return new ShaderMaterial({
      vertexShader: earthVertShader,
      fragmentShader: earthFragShader,
      uniforms: {
        uDayTexture: { value: dayTexture },
        uNightTexture: { value: nightTexture },
        uSunDirection: { value: new Vector3(1, 0, 0) },
        uTime: { value: 0 }
      }
    })
  }, [dayTexture, nightTexture])

  // Speed multipliers: how many game seconds pass per real second
  const getSpeedMultiplier = (speed: string): number => {
    switch (speed) {
      case 'paused': return 0
      case 'normal': return 1      // 1 game second per real second
      case 'fast': return 60       // 1 game minute per real second
      case 'fastest': return 3600  // 1 game hour per real second
      default: return 0
    }
  }

  // Update globe rotation based on game time and speed
  useFrame((state, delta) => {
    if (!meshRef.current) return
    
    const speedMultiplier = getSpeedMultiplier(gameSpeed)
    
    // Detect user-initiated time jumps (much larger than normal game ticks)
    const dateDiff = currentDate.getTime() - lastDateRef.current.getTime()
    // Normal game tick advances by speedMultiplier * delta seconds
    // User jumps are typically hours/days, so > 1 hour is a safe threshold
    if (Math.abs(dateDiff) > 3600 * 1000) {
      const targetAngle = getEarthRotationAngle(currentDate)
      accumulatedRotationRef.current = targetAngle
      // Also sync shader sun angle to stay in phase with new game time.
      accumulatedSunAngleRef.current = getSunOrbitAngle(currentDate)
    }
    lastDateRef.current = new Date(currentDate)

    // Smoothly advance rotation: Earth rotates 2π radians per 86400 game seconds
    const rotationSpeed = (2 * Math.PI) / 86400
    accumulatedRotationRef.current += rotationSpeed * speedMultiplier * delta

    // Use current date for seasonal calculations (these change slowly, jumps are fine)
    const dayOfYear = getDayOfYear(currentDate)
    const axialTilt = getSeasonalAxialTilt(dayOfYear)

    // Apply rotation: Y rotation for Earth's daily spin, X rotation for axial tilt
    meshRef.current.rotation.y = accumulatedRotationRef.current
    meshRef.current.rotation.x = axialTilt

    // Smoothly advance sun angle for shader so shadows move continuously.
    const sunAngleSpeed = (2 * Math.PI) / 86400
    accumulatedSunAngleRef.current += sunAngleSpeed * speedMultiplier * delta
    
    // Update shader sun direction with seasonal declination so day/night terminator matches real Earth.
    {
      const dayOfYear = getDayOfYear(currentDate)
      const declination = getSolarDeclination(dayOfYear)

      const x = SUN_DISTANCE * Math.cos(accumulatedSunAngleRef.current)
      const y = SUN_DISTANCE * Math.sin(declination)
      const z = SUN_DISTANCE * Math.sin(accumulatedSunAngleRef.current)

      shaderMaterial.uniforms.uSunDirection.value.set(x, y, z).normalize()
    }

    // Update time uniform
    shaderMaterial.uniforms.uTime.value = state.clock.elapsedTime
  })
  
  if (!dayTexture || !nightTexture) {
    return null
  }
  
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  )
}

// Simple aircraft component
function SimpleAircraft({ 
  aircraft, 
  airports 
}: { 
  aircraft: Aircraft, 
  airports: Airport[]
}) {
  const currentAirport = airports.find(a => a.iata === aircraft.currentLocation)
  
  const position: [number, number, number] = [0, 0, 0]
  
  if (currentAirport) {
    const pos = latLonToPosition(currentAirport.latitude, currentAirport.longitude)
    position[0] = pos[0]
    position[1] = pos[1]
    position[2] = pos[2]
  }
  
  let color = '#ffffff'
  switch (aircraft.status) {
    case 'in-flight':
      color = '#00ffff'
      break
    case 'maintenance':
      color = '#ff0000'
      break
    case 'available':
      color = '#00ff00'
      break
    case 'parked':
      color = '#ffff00'
      break
    default:
      color = '#ffffff'
  }

  return (
    <mesh position={position}>
      <boxGeometry args={[0.8, 0.2, 1.5]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

// Flight route component
function FlightRoute({ 
  route, 
  airports 
}: { 
  route: Route, 
  airports: Airport[]
}) {
  const points: [number, number, number][] = []
  
  const origin = airports.find(a => a.iata === route.origin)
  const destination = airports.find(a => a.iata === route.destination)
  
  if (origin && destination) {
    const originPos = latLonToPosition(origin.latitude, origin.longitude)
    const destPos = latLonToPosition(destination.latitude, destination.longitude)
    
    points.push(originPos as [number, number, number])
    points.push(destPos as [number, number, number])
  }
  
  return (
    <Line
      points={points}
      color={0x00ffff}
      transparent
      opacity={0.6}
    />
  )
}

// Main WorldView component
const WorldView = () => {
  const { airline } = useGameStore()
  const sunLightRef = useRef<DirectionalLight>(null)
  
  if (!airline || !airline.fleet || !airline.routes) {
    return (
      <div className="w-full h-full bg-black overflow-hidden rounded-lg border border-slate-800 flex items-center justify-center">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-white mb-4">World View</h2>
          <p className="text-slate-400 mb-4">Start by creating your airline to see the world view.</p>
          <p className="text-slate-500 text-sm">Navigate to the Airline Setup screen to begin.</p>
        </div>
      </div>
    )
  }
  
  const airports = AIRPORT_DATABASE
  const aircrafts = airline.fleet || []
  const routes = airline.routes || []
  
  return (
    <div className="w-full h-full bg-black overflow-hidden rounded-lg border border-slate-800">
      <Canvas camera={{ position: [0, 40, 90], fov: 45 }}>
        {/* Starry galaxy background */}
        <Stars radius={200} depth={150} count={15000} factor={6} />
        
        {/* Sun with bloom-like glow */}
        <Sun lightRef={sunLightRef} />
        
        {/* Directional light from sun - position synced via ref */}
        <directionalLight ref={sunLightRef} intensity={1.0} />
        
        {/* Subtle ambient light so dark side of scene isn't completely black */}
        <ambientLight intensity={0.05} />
        
        {/* Earth with day/night shader */}
        <Earth />

        {/* Render Aircraft */}
        {aircrafts.map((aircraft) => (
          <SimpleAircraft 
            key={aircraft.id} 
            aircraft={aircraft} 
            airports={airports}
          />
        ))}

        {/* Render Routes */}
        {routes.map((route) => (
          <FlightRoute 
            key={route.id} 
            route={route} 
            airports={airports}
          />
        ))}

        <OrbitControls enablePan={true} makeDefault />
      </Canvas>
    </div>
  )
}

export { WorldView }
