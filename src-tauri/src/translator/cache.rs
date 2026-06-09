use std::sync::Mutex;

const DEFAULT_CAPACITY: usize = 100;

#[derive(Clone)]
pub struct CacheKey {
    pub text: String,
    pub model: String,
    pub base_url: String,
    pub direction: String,
    pub kind: String,
}

impl CacheKey {
    fn serialize(&self) -> String {
        format!(
            "{}\t{}\t{}\t{}\t{}",
            self.kind, self.model, self.base_url, self.direction, self.text
        )
    }
}

pub struct TranslateCache {
    capacity: usize,
    entries: Mutex<Vec<(String, String)>>, // 简单 LRU: 队尾为最近访问
}

impl Default for TranslateCache {
    fn default() -> Self {
        Self::with_capacity(DEFAULT_CAPACITY)
    }
}

impl TranslateCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_capacity(capacity: usize) -> Self {
        assert!(capacity > 0);
        Self {
            capacity,
            entries: Mutex::new(Vec::with_capacity(capacity + 1)),
        }
    }

    pub fn get(&self, key: &CacheKey) -> Option<String> {
        let k = key.serialize();
        let mut entries = self.entries.lock().unwrap();
        if let Some(idx) = entries.iter().position(|(kk, _)| kk == &k) {
            let (kk, vv) = entries.remove(idx);
            entries.push((kk, vv.clone()));
            Some(vv)
        } else {
            None
        }
    }

    pub fn set(&self, key: CacheKey, value: String) {
        let k = key.serialize();
        let mut entries = self.entries.lock().unwrap();
        entries.retain(|(kk, _)| kk != &k);
        entries.push((k, value));
        while entries.len() > self.capacity {
            entries.remove(0);
        }
    }

    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.entries.lock().unwrap().len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn k(t: &str) -> CacheKey {
        CacheKey {
            text: t.into(),
            model: "m".into(),
            base_url: "u".into(),
            direction: "auto".into(),
            kind: "translation".into(),
        }
    }

    #[test]
    fn set_and_get() {
        let c = TranslateCache::new();
        c.set(k("a"), "A".into());
        assert_eq!(c.get(&k("a")).as_deref(), Some("A"));
    }

    #[test]
    fn lru_evicts_oldest() {
        let c = TranslateCache::with_capacity(2);
        c.set(k("a"), "A".into());
        c.set(k("b"), "B".into());
        c.set(k("c"), "C".into());
        assert!(c.get(&k("a")).is_none());
        assert!(c.get(&k("b")).is_some());
        assert!(c.get(&k("c")).is_some());
    }

    #[test]
    fn different_direction_does_not_collide() {
        let c = TranslateCache::new();
        let k1 = CacheKey {
            text: "x".into(),
            model: "m".into(),
            base_url: "u".into(),
            direction: "auto".into(),
            kind: "translation".into(),
        };
        let k2 = CacheKey {
            text: "x".into(),
            model: "m".into(),
            base_url: "u".into(),
            direction: "zh-en".into(),
            kind: "translation".into(),
        };
        c.set(k1, "A".into());
        c.set(k2, "B".into());
        let k1q = CacheKey {
            text: "x".into(),
            model: "m".into(),
            base_url: "u".into(),
            direction: "auto".into(),
            kind: "translation".into(),
        };
        assert_eq!(c.get(&k1q).as_deref(), Some("A"));
    }
}
