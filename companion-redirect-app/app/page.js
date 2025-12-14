export default function Home() {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      textAlign: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      margin: 0,
      padding: '2rem'
    }}>
      <div>
        <h1 style={{ 
          fontSize: '3rem', 
          marginBottom: '1rem',
          fontWeight: 'bold'
        }}>
          🔗 Redirect Service
        </h1>
        <p style={{ 
          fontSize: '1.2rem', 
          opacity: 0.9,
          marginBottom: '2rem'
        }}>
          This is a companion redirect service powered by the<br />
          Secure Redirect System.
        </p>
        <div style={{ 
          fontSize: '0.9rem', 
          opacity: 0.7,
          borderTop: '1px solid rgba(255,255,255,0.3)',
          paddingTop: '2rem',
          marginTop: '2rem'
        }}>
          <p>Powered by Vercel Edge Network</p>
          <p style={{ marginTop: '0.5rem' }}>
            Fast, secure, and globally distributed
          </p>
        </div>
      </div>
    </div>
  );
}

