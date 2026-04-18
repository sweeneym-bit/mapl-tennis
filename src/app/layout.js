export const metadata = {
  title: 'MAPL Boys\' Tennis Tournament',
  description: 'Live brackets and team scores',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f4f6f9' }}>
        {children}
      </body>
    </html>
  )
}
