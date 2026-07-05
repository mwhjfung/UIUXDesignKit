import Button from '@atlaskit/button/new'
import Heading from '@atlaskit/heading'
import { token } from '@atlaskit/tokens'

export default function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '32px 24px',
        background: token('color.background.neutral', '#F4F5F7'),
        color: token('color.text', '#172B4D'),
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Heading size="xlarge">PROTOTYPE_TITLE</Heading>
        <p style={{ color: token('color.text.subtle', '#5E6C84'), maxWidth: 540, lineHeight: 1.5 }}>
          PROTOTYPE_DESCRIPTION
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <Button appearance="primary">Primary action</Button>
          <Button>Default</Button>
          <Button appearance="subtle">Subtle</Button>
        </div>
      </div>
    </div>
  )
}
