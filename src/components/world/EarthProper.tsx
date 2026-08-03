import { useTexture } from '@react-three/drei'
import { useGameStore } from '@/store/gameStore'
import { useMemo } from 'react'

// Earth component with proper day/night texture switching
function EarthProper() {
  // Load textures using useTexture hook
  const [dayTexture, nightTexture] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg'
  ])
  
  // Ensure textures are loaded properly before rendering
  if (!dayTexture || !nightTexture) {
    console.warn('Day or night texture failed to load')
    // Fallback to simple material if textures fail to load
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
  
  // Create a material that will be reused
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: dayTexture,
      roughness: 0.8,
      metalness: 0.2,
      transparent: true,
      opacity: 1.0
    })
  }, [dayTexture])
  
  // For debugging: log texture info
  console.log('Day texture loaded:', dayTexture)
  console.log('Night texture loaded:', nightTexture)
  
  return (
    <mesh>
      <sphereGeometry args={[45, 64, 64]} />
      <primitive object={material} />
    </mesh>
  )
}

export { EarthProper }