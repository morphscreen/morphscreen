# Every pack component

<Card title="data">
<KeyValue title="Server">
| Field | Value |
|---|---|
| Name | api-eu-1 |
| Region | eu-west-1 |
| Uptime | 41 days |
</KeyValue>

<Timeline title="Milestones">
- 2019: Founded in a Lisbon flat
- 2021: First 1,000 customers
- 2024: Series B, 120 people
</Timeline>

<Columns>
<Gauge label="CPU" value="72" unit="%" tone="warning" />
<Gauge label="Air quality" value="42" max="300" tone="success" />
</Columns>

<Heatmap title="Commits">
| Day | Morning | Afternoon | Evening |
|---|---|---|---|
| Mon | 4 | 12 | 3 |
| Tue | 8 | 15 | 1 |
| Wed | 2 | 9 | 7 |
</Heatmap>

<Funnel title="Signup">
| Step | Users |
|---|---|
| Landing | 12000 |
| Signup | 3100 |
| Verified | 2400 |
| Paid | 410 |
</Funnel>

<Columns>
<Sparkline label="AAPL" value="$187.20" change="+1.4%" values="180 | 182 | 181 | 184 | 183 | 186 | 187" />
<Sparkline label="TSLA" value="$242.10" change="-2.1%" values="255 | 251 | 249 | 250 | 246 | 244 | 242" />
</Columns>

<Tree title="Organisation">
- Engineering > Platform
- Engineering > Mobile
- Sales > EMEA
- Sales > Americas > US
</Tree>
</Card>

<Card title="commerce">
<Columns>
<Product name="Studio Headphones" price="$249" was="$299" rating="4.5" badge="Sale">Closed-back, 30 hours of battery.</Product>
<Product name="Travel Earbuds" price="$129" rating="4.1">Small case, noise cancelling.</Product>
</Columns>

<Columns>
<Plan name="Starter" price="$0" period="/month">
- 3 projects
- Community support
</Plan>
<Plan name="Team" price="$29" period="/month" featured="true" note="Most popular">
- Unlimited projects
- SSO
- Priority support
</Plan>
</Columns>

<Cart title="Your cart" total="$412.00" note="Free shipping over $50">
| Item | Qty | Price |
|---|---|---|
| Studio Headphones | 1 | $249.00 |
| USB-C cable | 2 | $24.00 |
| Case | 1 | $139.00 |
</Cart>

Rated <Rating value="4.6" count="1,203 reviews" /> by buyers.

<Compare title="Phones">
| Feature | Pixel 10 | iPhone 17 |
|---|---|---|
| Screen | 6.3" | 6.1" |
| 5G | yes | yes |
| Headphone jack | no | no |
</Compare>

<Price value="$49" was="$79" period="/month" note="First year" />
</Card>

<Card title="scheduling">
<Calendar month="2026-10">
| Date | What |
|---|---|
| 2026-10-15 | Design review |
| 2026-10-20 | Launch |
</Calendar>

<Event title="Launch party" start="2026-10-20T18:00" end="2026-10-20T21:00" where="Rooftop, 5th floor" tone="info">Bring a guest.</Event>

<Form name="book">
<TimeSlots label="Time" options="09:00 | 09:30 | 10:00 | 14:30" required="true" />
<Button>Book</Button>
</Form>

<Agenda title="Day one">
| Time | Talk |
|---|---|
| 09:00 | Keynote |
| 10:30 | Rust on phones |
</Agenda>

<Countdown label="Until launch" until="2036-10-20T18:00" />
</Card>

<Card title="media">
<Video src="https://example.com/lesson.mp4" title="Lesson 3" caption="12 minutes" />
<Audio src="https://example.com/ep42.mp3" title="Episode 42" />
<Embed src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="How to fold dumplings" />
<Carousel title="Apartment">
![Living room](https://example.com/a.jpg)
![Kitchen](https://example.com/b.jpg)
</Carousel>
</Card>

<Card title="docs">
<Code file="config.toml" highlight="2">
```toml
[server]
port = 8080
host = "0.0.0.0"
```
</Code>

<Diff file="src/rate.ts">
```diff
@@ -1,3 +1,3 @@
-const limit = 10;
+const limit = 100;
 export { limit };
```
</Diff>

<Math tex="E_k = \frac{1}{2} m v^2" label="Kinetic energy" />
<Math tex="\sigma = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (x_i - \mu)^2}" />

<FileTree title="Project">
- src/
- src/main.rs
- src/lib.rs
- Cargo.toml
- README.md
</FileTree>

<Citation title="Caffeine and sleep" href="https://example.com/study" source="Sleep Journal" date="2023">Caffeine six hours before bed cut total sleep by about an hour.</Citation>
</Card>

<Card title="inputs">
<Form name="feedback">
<RatingInput label="How was it?" value="4" />
<Combobox label="Airport" options="LIS Lisbon | OPO Porto | MAD Madrid" placeholder="Type to search" />
<Time label="Alarm" value="06:45" />
<ToggleGroup label="Days" options="Mon | Tue | Wed | Thu | Fri" value="Mon | Wed" multiple="true" />
<Stepper label="Travellers" value="2" min="1" max="9" unit="people" />
<Signature label="Sign here" required="true" />
<Button>Send</Button>
</Form>
</Card>

<Card title="device">
<Form name="invite">
<Contact label="Invite a friend" />
<VoiceNote label="Voice update" max="60" />
</Form>
<AddToCalendar title="Dinner" start="2026-10-24T19:30" end="2026-10-24T22:00" where="Taberna Sal Grosso">Add to calendar</AddToCalendar>
<Share text="Worth reading" href="https://example.com/article">Share</Share>
<QR value="WIFI:T:WPA;S:Guest House;P:correct horse battery;;" label="Join the Wi-Fi" />
</Card>

<Card title="Interactive">
<Quiz title="Quick check">
<Question text="What absorbs light in a leaf?" answer="B" explain="Chlorophyll in the chloroplasts absorbs red and blue light.">
- A. Stomata
- B. Chlorophyll
- C. Xylem
</Question>
<Question text="Which gas do plants take in?" answer="Carbon dioxide" explain="CO₂ enters through the stomata.">
- Oxygen
- Carbon dioxide
- Nitrogen
</Question>
</Quiz>

<Flashcards title="Key terms">
| Term | Meaning |
|---|---|
| Chlorophyll | The green pigment that absorbs light |
| Stomata | Pores that let gases in and out |
| Glucose | The sugar a plant makes |
</Flashcards>

<Poll label="Which topic next?" options="Respiration | Transpiration | Cell division" name="next" />

<Checklist title="Revision plan" name="revision">
- [x] Read chapter 4
- [ ] Draw the leaf diagram
- [ ] Do the past paper
</Checklist>

<WhatIf title="Order total">
<Slider label="Price" min="5" max="100" value="20" />
<Slider label="Quantity" name="qty" min="1" max="10" value="3" />
<Slider label="Discount (%)" min="0" max="50" value="10" />
<Result label="Total" value="price * qty * (1 - discount / 100)" unit="$" decimals="2" />
<Result label="Saved" value="price * qty * discount / 100" unit="$" decimals="2" />
</WhatIf>
</Card>
