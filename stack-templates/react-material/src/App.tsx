import { createTheme, ThemeProvider, CssBaseline } from '@mui/material'
import { Box, Typography, Button, Stack } from '@mui/material'

const theme = createTheme({
  typography: { fontFamily: 'Roboto, sans-serif' },
})

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50', p: 4 }}>
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
          <Typography variant="h4" fontWeight={500} gutterBottom>
            PROTOTYPE_TITLE
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 540 }}>
            PROTOTYPE_DESCRIPTION
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained">Primary</Button>
            <Button variant="outlined">Outlined</Button>
            <Button variant="text">Text</Button>
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  )
}
