export const metadata = {
  title: 'MAPL Boys\' Tennis Tournament',
  description: 'Live brackets and team scores — Mid-Atlantic Prep League',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#FAFAF8' }}>
        {children}
      </body>
    </html>
  )
}
