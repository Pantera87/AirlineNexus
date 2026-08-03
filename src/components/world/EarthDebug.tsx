import { useTexture } from '@react-three/drei'
import { useGameStore } from '@/store/gameStore'
import { useEffect, useState } from 'react'

// Debug Earth component to verify textures load correctly
function EarthDebug() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Load textures using useTexture hook
  const [dayTexture, nightTexture] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg'
  ])
  
  useEffect(() => {
    if (dayTexture && nightTexture) {
      console.log('Textures loaded successfully!')
      console.log('Day texture:', dayTexture)
      console.log('Night texture:', nightTexture)
      setLoading(false)
    } else if (dayTexture || nightTexture) {
      console.log('Partial texture load')
      setLoading(false)
    } else {
      setError('Failed to load textures')
      setLoading(false)
    }
  }, [dayTexture, nightTexture])
  
  if (loading) {
    return (
      <mesh>
        <sphereGeometry args={[45, 64, 64]} />
        <meshStandardMaterial 
          color="#ff0000"
          wireframe={true}
        />
      </mesh>
    )
  }
  
  if (error) {
    return (
      <mesh>
        <sphereGeometry args={[45, 64, 64]} />
        <meshStandardMaterial 
          color="#ff0000"
          wireframe={false}
        />
      </mesh>
    )
  }
  
  // If textures loaded, use day texture for now
  return (
    <mesh>
      <sphereGeometry args={[45, 64, 64]} />
      <meshStandardMaterial 
        map={dayTexture}
        roughness={0.8} 
        metalness={0.2}
        wireframe={false}
        transparent={true}
        opacity={1.0}
      />
    </mesh>
  )
}

export { EarthDebug }