import React, { useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sky, Line, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/store/gameStore'
import type { Aircraft, Route, Airport } from '@/types/game'
import { AIRPORT_DATABASE } from '@/data/airports'

// Convert lat/lon to 3D position (simplified spherical projection)
function latLonToPosition(lat: number, lon: number, radius: number = 45): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  const x = radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)

  return [x, y, z]
}

// Calculate sun position based on date/time (simplified orbital mechanics)
// This creates a sun that moves around the Earth in a circular orbit
function calculateSunPosition(date: Date): [number, number, number] {
  // Get time of day (0-24)
  const hours = date.getHours()
  const minutes = date.getMinutes()

  // Convert to fraction of day (0-1)
  const timeOfDay = (hours + minutes / 60) / 24

  // Calculate angle around the Earth (0 to 2π)
  // Sun moves clockwise when viewed from above the North Pole
  const angle = timeOfDay * Math.PI * 2 - Math.PI / 2  // Start at top (noon)

  // Distance from Earth center (larger distance for more dramatic effect)
  const sunDistance = 150

  // Calculate position in 3D space
  const x = sunDistance * Math.sin(angle)
  const z = sunDistance * Math.cos(angle)
  const y = 20  // Keep some height to avoid being directly on the equator plane

  return [x, y, z]
}

// Simple aircraft component that doesn't use hooks
function SimpleAircraft({
  aircraft,
  airports
}: {
  aircraft: Aircraft,
  airports: Airport[]
}) {
  // Get airport data for current location
  const currentAirport = airports.find(a => a.iata === aircraft.currentLocation)

  // Default position if no airport found
  const position: [number, number, number] = [0, 0, 0]

  if (currentAirport) {
    const pos = latLonToPosition(currentAirport.latitude, currentAirport.longitude)
    position[0] = pos[0]
    position[1] = pos[1]
    position[2] = pos[2]
  }

  // Determine color based on aircraft status
  let color = '#ffffff' // default white
  switch (aircraft.status) {
    case 'in-flight':
      color = '#00ffff' // cyan for in-flight
      break
    case 'maintenance':
      color = '#ff0000' // red for maintenance
      break
    case 'available':
      color = '#00ff00' // green for available
      break
    case 'parked':
      color = '#ffff00' // yellow for parked
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

// Component for a flight route (a line in 3D space)
function FlightRoute({
  route,
  airports
}: {
  route: Route,
  airports: Airport[]
}) {
  const points: [number, number, number][] = []

  // Get origin and destination airports
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
      color="#00ffff"
      lineWidth={2 as number}
      transparent
      opacity={0.6}
    />
  )
}

// Galaxy background component - creates a nebula-like galaxy effect
function GalaxyBackground() {
  // Create a large sphere with particle-like appearance
  return (
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <sphereGeometry args={[150, 64, 64]} />
      <shaderMaterial
        fragmentShader={`
          uniform float time;
          varying vec2 vUv;

          void main() {
            // Create a galaxy/nebula pattern with swirling arms
            vec2 p = vUv - vec2(0.5);
            float a = atan(p.y, p.x) + 3.0 * sin(time * 0.1);
            float r = length(p);

            // Multiple spiral arms with different colors
            float arm1 = abs(sin(a * 4.0) / (r * 2.0 + 0.1));
            float arm2 = abs(sin(a * 3.5 + 2.0) / (r * 2.0 + 0.1));
            float arm3 = abs(sin(a * 4.5 - 1.0) / (r * 2.0 + 0.1));

            // Color based on spiral arms
            vec3 col = mix(
              vec3(0.1, 0.05, 0.2), // deep blue/purple base
              mix(
                vec3(0.8, 0.4, 0.6), // pink arm
                mix(
                  vec3(0.3, 0.7, 0.9), // light blue arm
                  vec3(0.9, 0.6, 0.2), // yellow arm
                  arm3
                ),
                arm2
              ),
              arm1 * 0.8
            );

            // Add noise and variation
            float noise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
            col *= 0.5 + 0.5 * noise;

            // Fade out at edges
            float edgeFade = smoothstep(0.95, 1.0, r);
            col *= edgeFade;

            gl_FragColor = vec4(col, 0.8);
          }
        `}
        vertexShader={`
          uniform float time;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 pos = position;
            float r = length(pos);
            // Add slight distortion for more organic look
            pos += normalize(pos) * 0.5 * sin(r * 2.0 + time * 0.2);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `}
        uniforms={{ time: { value: 0 } }}
        side={THREE.BackSide}
        transparent
      />
    </mesh>
  )
}

// Sun component - a visible representation of the sun that follows time-based positioning
function Sun({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      {/* Sun with glow effect */}
      <sphereGeometry args={[3, 16, 16]} />
      <meshBasicMaterial color="#ffeb3b" emissive="#ffff00" emissiveIntensity={2} toneMapped={false} />

      {/* Glow effect using sprite */}
      <pointLight position={position} color="#ffff00" intensity={5} distance={300} />
    </mesh>
  )
}

// Earth component to represent the globe with proper textures and atmosphere effects
function Earth({ sunPosition }: { sunPosition: [number, number, number] }) {
  // Load textures using useTexture hook
  const [dayTexture, nightTexture, specularCloudsTexture] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/specularClouds.jpg'
  ])

  // Set color space for sRGB textures
  dayTexture.colorSpace = THREE.SRGBColorSpace
  nightTexture.colorSpace = THREE.SRGBColorSpace

  // Create custom shader material for Earth with atmosphere and lighting
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uDayTexture: { value: dayTexture },
      uNightTexture: { value: nightTexture },
      uSpecularCloudsTexture: { value: specularCloudsTexture },
      uAtmosphereDayColor: { value: new THREE.Color(0x5599ff) },
      uAtmosphereTwilightColor: { value: new THREE.Color(0xff6600) },
      uRoughnessLow: { value: 0.3 },
      uRoughnessHigh: { value: 1.0 },
      uSunPosition: { value: new THREE.Vector3(sunPosition[0], sunPosition[1], sunPosition[2]) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;

      void main() {
        vUv = uv;
        vPosition = position;
        vNormal = normalize(normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uDayTexture;
      uniform sampler2D uNightTexture;
      uniform sampler2D uSpecularCloudsTexture;
      uniform vec3 uAtmosphereDayColor;
      uniform vec3 uAtmosphereTwilightColor;
      uniform float uRoughnessLow;
      uniform float uRoughnessHigh;
      uniform vec3 uSunPosition;

      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;

      void main() {
        // Day/night color based on lighting
        vec3 dayColor = texture(uDayTexture, vUv).rgb;
        vec3 nightColor = texture(uNightTexture, vUv).rgb;

        // Calculate lighting - dot product between normal and light direction (in object space)
        float lightIntensity = max(dot(normalize(vNormal), normalize(uSunPosition)), 0.0);

        // Blend textures based on lighting with smooth transition
        float mixAmount = smoothstep(0.1, 0.3, lightIntensity);
        vec3 color = mix(nightColor * 2.5, dayColor, mixAmount); // Brighten only the night areas

        // Atmosphere glow
        float atmosphere = smoothstep(uRoughnessLow, uRoughnessHigh, abs(vNormal.y));
        vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, vNormal.y + 0.5);
        color += atmosphere * atmosphereColor * 0.2;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })

  // Create earth mesh
  const earthMesh = React.useRef<THREE.Mesh>(null)

  // Animation loop for slow Earth rotation
  React.useEffect(() => {
    if (!earthMesh.current) return

    let animationFrameId: number
    let startTime: number | null = null

    const animateRotation = (time: number) => {
      if (!startTime) {
        startTime = time
      }

      // Calculate elapsed time in seconds
      const elapsedSeconds = (time - startTime) / 1000

      // Slow rotation: ~15 hours for one full rotation (24π radians)
      // Earth rotates once every 24 hours, so we'll make it slower (~15 hours per rotation)
      const rotationSpeed = 0.00698  // radians per second (2π / 15 hours)

      if (earthMesh.current) {
        earthMesh.current.rotation.y = elapsedSeconds * rotationSpeed
      }

      animationFrameId = requestAnimationFrame(animateRotation)
    }

    animateRotation(performance.now())

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <primitive ref={earthMesh} object={new THREE.Mesh(
      new THREE.SphereGeometry(45, 64, 64),
      earthMaterial
    )} />
  )
}

// Main WorldView component
const WorldView = () => {
  const { airline, currentDate } = useGameStore()
  const sunPositionRef = useRef<[number, number, number]>([100, 10, 100])

  // Calculate and update sun position based on game time
  useEffect(() => {
    if (currentDate) {
      sunPositionRef.current = calculateSunPosition(currentDate)
    }
  }, [currentDate])

  // Animation for galaxy background and sun positioning
  const animateGalaxy = (time: number) => {
    const materials = document.querySelectorAll('shaderMaterial') as any
    materials.forEach((mat: any) => {
      if (mat.uniforms && mat.uniforms.time) {
        mat.uniforms.time.value = time * 0.001
      }
    })
  }

  // Add animation to canvas
  const handleCreated = ({ gl }: { gl: THREE.WebGLRenderer }) => {
    return () => {
      gl.setAnimationLoop(animateGalaxy)
    }
  }

  // Add defensive checks for the airline data
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
      <Canvas camera={{ position: [0, 30, 50], fov: 45 }} onCreated={handleCreated}>
        <Sky sunPosition={sunPositionRef.current} />

        <ambientLight intensity={2.0} />
        <directionalLight position={sunPositionRef.current as [number, number, number]} intensity={2.5} castShadow />
        <directionalLight position={[-sunPositionRef.current[0], -sunPositionRef.current[1], -sunPositionRef.current[2]] as [number, number, number]} intensity={0.6} castShadow />

        <Sun position={sunPositionRef.current} />
        <Earth sunPosition={sunPositionRef.current} />

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

export { WorldView };