// An app built with MUI 9 (Material UI): an app bar, cards, a form and a
// table, with an assistant's answer in a card. mui.html draws the answer
// into #slot once this has rendered.
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AppBar, Box, Button, Card, CardContent, Checkbox, Container, CssBaseline, FormControlLabel, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ThemeProvider, Toolbar, Typography, createTheme } from "@mui/material";

const dark = matchMedia("(prefers-color-scheme: dark)").matches;

function App() {
  return (
    <ThemeProvider theme={createTheme({ palette: { mode: dark ? "dark" : "light" } })}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Acme Store
          </Typography>
          <Button color="inherit">Orders</Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Ask about your store
              </Typography>
              <Box id="slot" sx={{ display: "grid", gap: 3 }} />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6">Profile</Typography>
                <TextField label="Store name" defaultValue="Acme" size="small" />
                <FormControlLabel control={<Checkbox defaultChecked />} label="Live" />
                <Box>
                  <Button variant="contained">Save</Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
          <TableContainer component={Card}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Order</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>#1042</TableCell>
                  <TableCell>Paid</TableCell>
                  <TableCell align="right">$250.00</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="body2">
            Questions? <a href="#help">Read the help</a>.
          </Typography>
        </Stack>
      </Container>
    </ThemeProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(<App />));
