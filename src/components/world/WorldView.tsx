import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sky, Stars, Line } from '@react-three/drei'
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

// Earth component to represent the globe
function Earth() {
  return (
    <mesh>
      <sphereGeometry args={[45, 64, 64]} />
      <meshStandardMaterial 
        color="#0a1a0a" 
        roughness={0.8} 
        metalness={0.2}
        wireframe={false}
      />
    </mesh>
  )
}

// Ground component to represent the surface
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color="#0a1a0a" roughness={1} />
    </mesh>
  )
}

// Main WorldView component
const WorldView = () => {
  const { airline } = useGameStore()
  
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
      <Canvas camera={{ position: [0, 30, 50], fov: 45 }}>
        <Sky sunPosition={[100, 10, 100]} />
        <Stars radius={100} depth={50} count={5000} factor={4} />
        
        <ambientLight intensity={0.3} />
        <directionalLight position={[100, 10, 100] as [number, number, number]} intensity={1.5} castShadow />
        
        <Earth />
        <Ground />
        
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
