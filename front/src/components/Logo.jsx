import React from 'react'

function Logo({ scale = 1 }) {
  const size = 40 * scale       // quadrado externo
  const hole = 20 * scale        // quadrado interno (buraco)

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: '#2563EB',
        position: 'relative',
        borderRadius: '20%'
      }}
    >
      <div
        style={{
          width: `${hole}px`,
          height: `${hole}px`,
          backgroundColor: 'white', // pode ser 'transparent' se o fundo da tela for branco
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '20%'
        }}
      ></div>
    </div>
  )
}

export default Logo
