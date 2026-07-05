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
        <p
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: token('color.text.subtle', '#5E6C84'),
            margin: 0,
          }}
        >
          ProductDesignKit · React + Atlaskit
        </p>

        <Heading size="xlarge">Atlaskit hello</Heading>

        <p style={{ color: token('color.text.subtle', '#5E6C84'), maxWidth: 540, lineHeight: 1.5 }}>
          Proof that the v2 architecture works: this is a real React 18 prototype using real
          Atlaskit components (<code>@atlaskit/button</code>, <code>@atlaskit/heading</code>) and
          real ADS tokens, sitting alongside the Vue + shadcn-vue prototype in the same kit.
          The catalogue at <code>localhost:5170</code> lists both.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <Button appearance="primary" onClick={() => alert('Primary')}>Primary</Button>
          <Button onClick={() => alert('Default')}>Default</Button>
          <Button appearance="subtle" onClick={() => alert('Subtle')}>Subtle</Button>
          <Button appearance="warning" onClick={() => alert('Warning')}>Warning</Button>
          <Button appearance="danger" onClick={() => alert('Danger')}>Danger</Button>
          <Button isDisabled>Disabled</Button>
        </div>

        <hr style={{ border: 'none', borderTop: `1px solid ${token('color.border', '#DFE1E6')}`, margin: '12px 0' }} />

        <Heading size="small">What this prototype is for</Heading>
        <ul style={{ color: token('color.text.subtle', '#5E6C84'), lineHeight: 1.6, paddingLeft: 18 }}>
          <li>Validate that the kit can host a non-Vue prototype.</li>
          <li>Validate that real Atlaskit components install and render.</li>
          <li>Provide a starting point for any React + Atlaskit prototype work.</li>
        </ul>
      </div>
    </div>
  )
}
