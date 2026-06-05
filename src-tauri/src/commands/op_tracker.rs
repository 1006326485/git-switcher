use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use dashmap::DashMap;

/// Global operation counter for generating unique IDs.
static OP_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Tracks active operations for cancellation support.
pub type ActiveOps = DashMap<u64, Arc<AtomicBool>>;

pub fn next_op_id() -> u64 {
    OP_COUNTER.fetch_add(1, Ordering::Relaxed)
}
