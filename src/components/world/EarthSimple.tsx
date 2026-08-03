import { useTexture } from '@react-three/drei'
import { useEffect, useState } from 'react'

// Simple Earth component that loads textures properly
function EarthSimple() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Load textures using useTexture hook
  const [dayTexture, nightTexture] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg'
  ])
  
  useEffect(() => {
    if (dayTexture && nightTexture) {
      console.log('✅ Textures loaded successfully!')
      console.log('Day texture:', dayTexture)
      console.log('Night texture:', nightTexture)
      setLoading(false)
    } else {
      setError('Failed to load textures')
      setLoading(false)
    }
  }, [dayTexture, nightTexture])
  
  if (loading) {
    // Show loading state
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
    // Show error state
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
  
  // Use day texture for now to verify it works
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

export { EarthSimple }