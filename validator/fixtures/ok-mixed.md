Here's your status page.

# API status

<Columns>
<Stat label="Uptime this month" value="99.98%" change="+0.02%">
<Stat label="Open incidents" value="0" />
</Columns>

<Callout tone="Success" title="Resolved">The 12 Oct latency incident was fixed at 14:05 UTC.</Callout>

<Tabs>
<Tab title="Latency">
<Chart type="column" title="p95 latency (ms)">
| Day | p95 |
|---|---|
| Mon | 120 |
| Tue | 1,140 |
</Chart>
</Tab>
<Tab title="Notes">
- Root cause: a bad config push
- Fix: rollback
</Tab>
</Tabs>

<FollowUps>
- Show last month
- Who was on call?
</FollowUps>
