// Every part MorphScreenUI dresses, in every state, on one page: what
// ui/test-sheet.mjs looks at in a browser at 390 and 1280 px.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  Checkbox,
  Dialog,
  Field,
  Input,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  ThemeProvider,
  ToastProvider,
  useToast,
} from "hosanna-ui";
import "hosanna-ui/styles.css";
import { lens } from "../glass.ts";

const packs: [string, string, number][] = [
  ["sky", "Data", 7],
  ["peach", "Commerce", 6],
  ["aqua", "Device", 10],
  ["butter", "Docs", 5],
  ["rose", "Media", 4],
  ["lime", "Inputs", 6],
  ["lilac", "Interactive", 5],
  ["mint", "Scheduling", 5],
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="sheet-row">
      <h2 className="msui-caption">{label}</h2>
      <div className="sheet-items">{children}</div>
    </section>
  );
}

function GlassNav() {
  const nav = useRef<HTMLElement>(null);
  const [tab, setTab] = useState(0);
  useEffect(() => (nav.current ? lens(nav.current) : undefined), []);
  const names = ["Overview", "Keys", "Calls"];
  return (
    <div className="sheet-stage">
      <div className="sheet-bars" aria-hidden="true">
        {[46, 132, 86, 112, 158, 66, 30].map((h, i) => (
          <span key={i} style={{ height: h, background: i === 4 ? "var(--msui-sky)" : "var(--msui-sky-chart)" }} />
        ))}
      </div>
      <nav ref={nav} className="msui-glass sheet-nav" aria-label="Sections">
        <span className="msui-glass-pill sheet-pill" style={{ transform: `translateX(${tab * 100}%)` }} aria-hidden="true" />
        {names.map((n, i) => (
          <button key={n} type="button" aria-pressed={i === tab} onClick={() => setTab(i)} className="sheet-navtab">
            {n}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Sheet() {
  const { toast } = useToast();
  const [dialog, setDialog] = useState(false);
  const [on, setOn] = useState(true);
  useEffect(() => {
    toast({ title: "Key ms_live_3f9a revoked", description: "Apps using it stop in 8 s.", action: { label: "Undo", onClick: () => {} }, duration: 600000 } as Parameters<typeof toast>[0]);
  }, [toast]);
  return (
    <main className="sheet">
      <header className="sheet-head">
        <h1 className="msui-title1">The parts, in every state</h1>
        <p className="msui-body">hosanna-ui's parts dressed in MorphScreenUI. Words stay white or grey; colour sits on the mark beside them.</p>
      </header>

      <Row label="Buttons">
        <Button variant="primary" id="b-primary">Subscribe to Build</Button>
        <Button variant="secondary">Compare plans</Button>
        <Button variant="ghost">Not now</Button>
        <Button variant="danger">Revoke this key</Button>
        <Button variant="primary" disabled>Subscribed</Button>
        <Button variant="primary" loading>Paying</Button>
        <Button variant="secondary" size="sm">New key</Button>
      </Row>

      <Row label="Fields">
        <Field label="Project name" description="Shows in your usage and invoices">
          <Input defaultValue="checkout-assistant" data-sheet="name" />
        </Field>
        <Field label="Monthly limit" error="A whole number, like 25000">
          <Input defaultValue="25,000,0" data-sheet="limit" />
        </Field>
        <Field label="Account email" description="Change it from the sign-in page">
          <Input defaultValue="you@example.com" disabled />
        </Field>
      </Row>

      <Row label="Choices">
        <Switch checked={on} onChange={(e) => setOn(e.currentTarget.checked)} label="Keep debug logs 7 days" id="s-on" />
        <Switch checked={false} onChange={() => {}} label="Pay yearly" description="20% off twelve months." />
        <Switch checked disabled onChange={() => {}} label="Required by your plan" />
        <Checkbox defaultChecked label="I agree to the privacy notice" id="c-on" />
        <Checkbox label="Mail me product news" />
      </Row>

      <Row label="Tabs">
        <Tabs defaultValue="week" variant="solid">
          <TabList aria-label="Range">
            <Tab value="day">Day</Tab>
            <Tab value="week">Week</Tab>
            <Tab value="month">Month</Tab>
          </TabList>
          <TabPanel value="day" />
          <TabPanel value="week" />
          <TabPanel value="month" />
        </Tabs>
        <Tabs defaultValue="keys">
          <TabList aria-label="Page">
            <Tab value="overview">Overview</Tab>
            <Tab value="keys">Keys</Tab>
            <Tab value="calls" badge={<Badge tone="danger">2</Badge>}>Calls</Tab>
          </TabList>
          <TabPanel value="overview" />
          <TabPanel value="keys" />
          <TabPanel value="calls" />
        </Tabs>
      </Row>

      <Row label="Statuses: a tint, a dot, white words">
        <Badge tone="success">Answered</Badge>
        <Badge tone="warning">Repaired</Badge>
        <Badge tone="danger">Failed</Badge>
        <Badge tone="info">Streaming</Badge>
        <Badge>Free plan</Badge>
        <span className="msui-tag msui-mint">Table for 2 free</span>
        <span className="msui-tag msui-butter">Queue from 7</span>
        <span className="msui-tag msui-rose">Booked tonight</span>
      </Row>

      <Row label="Component families: the colour on the icon">
        {packs.map(([tone, name, count]) => (
          <span key={name} className={`msui-chip msui-${tone}`}>
            {name}
            <span className="msui-num msui-caption">{count}</span>
          </span>
        ))}
      </Row>

      <Row label="Near a limit">
        <div className="sheet-meter">
          <div className="sheet-meter-head">
            <span>Today</span>
            <span className="msui-num">84 of 100</span>
          </div>
          <div className="msui-meter msui-butter" role="meter" aria-label="Calls today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={84}>
            <span style={{ width: "84%" }} />
          </div>
          <span className="msui-caption">Resets at 05:30 IST; Build has no daily limit</span>
        </div>
      </Row>

      <Row label="Alerts">
        <Alert tone="info" title="Streaming">Drawing part 3 of 5: a chart.</Alert>
        <Alert tone="warning" title="Your last checkout wasn't finished">Choose a plan again to get a fresh payment page.</Alert>
        <Alert tone="danger" title="The model didn't answer">OpenRouter returned 502 after 3.1 s. This call wasn't counted.</Alert>
        <Alert tone="success" title="You're on Build">25,000 calls a month from today.</Alert>
      </Row>

      <Row label="A card and a table">
        <Card>
          <CardBody>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>What</TableHeaderCell>
                  <TableHeaderCell>Outcome</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>26 Oct, 22:09</TableCell>
                  <TableCell>deepseek-v4-flash, 1.8 s</TableCell>
                  <TableCell><Badge tone="success">Answered</Badge></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>26 Oct, 21:47</TableCell>
                  <TableCell>2 Table props fixed in 1 round</TableCell>
                  <TableCell><Badge tone="warning">Repaired</Badge></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardBody>
        </Card>
        <Button variant="secondary" id="open-dialog" onClick={() => setDialog(true)}>Delete this account</Button>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title="Delete this account?"
          description="We mail you a link; nothing is deleted until you open it."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>Keep it</Button>
              <Button variant="danger" onClick={() => setDialog(false)}>Mail me the link</Button>
            </>
          }
        />
      </Row>

      <Row label="Glass, on what floats">
        <GlassNav />
      </Row>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="dark" storageKey={null}>
    <ToastProvider>
      <Sheet />
    </ToastProvider>
  </ThemeProvider>,
);
