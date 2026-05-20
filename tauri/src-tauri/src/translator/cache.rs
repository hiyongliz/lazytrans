use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Default)]
pub struct TranslateCache {
    #[allow(dead_code)]
    entries: Mutex<HashMap<String, String>>,
}

impl TranslateCache {
    pub fn new() -> Self { Self::default() }
    pub fn get(&self, _key: &CacheKey) -> Option<String> { None } // T4.7 fills in
    pub fn set(&self, _key: CacheKey, _value: String) {}           // T4.7 fills in
}

pub struct CacheKey {
    pub text: String,
    pub model: String,
    pub base_url: String,
    pub direction: String,
    pub kind: String,
}
