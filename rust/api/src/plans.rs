//! The plans (decided 2026-10-23 and 24, roadmap K5 and P8): a free tier held
//! by a daily and a monthly limit, then calls by the month. Yearly is twelve
//! months at 20% off. A call is a chat or AG-UI request that brought an
//! answer back; renders count apart, free within a fair-use limit. Paid plans
//! include the model on our key for every call (included.rs), the free tier
//! for 100 a month; past its month a paid plan runs on, each extra call
//! billed, up to twice its month. In dollars for everyone, in rupees for
//! whoever picks them (decided 2026-10-28; India's own price points, decided
//! 2026-10-26, under the dollar price at about ₹96.5), every price with its
//! tax included: Dodo Payments, the merchant of record, takes the tax out of it.

pub struct Plan {
    pub name: &'static str,
    /// Calls a month, and a day (the free tier only).
    pub monthly: u32,
    pub daily: Option<u32>,
    /// Requests a minute and streams at once, per key.
    pub per_minute: u32,
    pub streams: u32,
    /// Renders a month, the fair-use limit.
    pub renders: u32,
    /// Dollars a month, and a year (20% off twelve months).
    pub usd_month: u32,
    pub usd_year: u32,
    /// Calls a month the model runs on our key; None: every call.
    pub included: Option<u32>,
    /// Dollars an extra call past the month; None: the month is the limit.
    pub extra: Option<f64>,
    /// The same in rupees, GST included: a month, a year, an extra call.
    pub inr_month: u32,
    pub inr_year: u32,
    pub inr_extra: Option<f64>,
}

pub const PLANS: &[Plan] = &[
    Plan { name: "free", monthly: 3_000, daily: Some(100), per_minute: 10, streams: 2, renders: 30_000, usd_month: 0, usd_year: 0, included: Some(100), extra: None, inr_month: 0, inr_year: 0, inr_extra: None },
    Plan { name: "build", monthly: 25_000, daily: None, per_minute: 60, streams: 10, renders: 250_000, usd_month: 49, usd_year: 470, included: None, extra: Some(0.002), inr_month: 4_999, inr_year: 47_990, inr_extra: Some(0.20) },
    Plan { name: "scale", monthly: 500_000, daily: None, per_minute: 300, streams: 50, renders: 5_000_000, usd_month: 499, usd_year: 4_790, included: None, extra: Some(0.001), inr_month: 49_999, inr_year: 479_990, inr_extra: Some(0.10) },
];

pub fn plan(name: &str) -> Option<&'static Plan> {
    PLANS.iter().find(|p| p.name == name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_year_is_twelve_months_at_twenty_percent_off_rounded_down() {
        for p in PLANS {
            assert_eq!(p.usd_year, p.usd_month * 12 * 8 / 10, "{}", p.name);
            assert_eq!(p.inr_year, p.inr_month * 12 * 8 / 10, "{} in rupees", p.name);
        }
        assert!(plan("free").unwrap().daily.is_some() && plan("build").unwrap().daily.is_none());
    }
}
