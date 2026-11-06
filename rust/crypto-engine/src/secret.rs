//! Wipe secret bytes after use, including when a scope exits on error.
use zeroize::Zeroize;

#[cfg(test)]
mod record {
  use std::cell::{Cell, RefCell};

  thread_local! {
    static ENABLED: Cell<bool> = const { Cell::new(false) };
    static LOG: RefCell<Vec<usize>> = const { RefCell::new(Vec::new()) };
  }

  pub fn start() {
    ENABLED.with(|flag| flag.set(true));
    LOG.with(|log| log.borrow_mut().clear());
  }

  pub fn take() -> Vec<usize> {
    ENABLED.with(|flag| flag.set(false));
    LOG.with(|log| log.replace(Vec::new()))
  }

  pub fn push(len: usize) {
    if len == 0 || !ENABLED.with(|flag| flag.get()) {
      return;
    }
    LOG.with(|log| log.borrow_mut().push(len));
  }
}

/// Overwrite `buf` with zeros. Test builds can observe the wiped length.
pub fn wipe_secret(buf: &mut [u8]) {
  #[cfg(test)]
  let len = buf.len();
  buf.zeroize();
  #[cfg(test)]
  record::push(len);
}

/// Owned secret that is wiped when dropped, including on `?` error paths.
pub struct SecretBytes(Vec<u8>);

impl SecretBytes {
  pub fn new(bytes: Vec<u8>) -> Self {
    Self(bytes)
  }

  pub fn as_slice(&self) -> &[u8] {
    &self.0
  }
}

impl Drop for SecretBytes {
  fn drop(&mut self) {
    wipe_secret(&mut self.0);
  }
}

#[cfg(test)]
pub fn start_wipe_record() {
  record::start();
}

#[cfg(test)]
pub fn take_wipe_record() -> Vec<usize> {
  record::take()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn wipe_secret_zeroes_observable_bytes() {
    let mut buf = vec![0xABu8; 32];
    wipe_secret(&mut buf);
    assert!(buf.iter().all(|byte| *byte == 0));
  }

  #[test]
  fn secret_bytes_drop_wipes_and_is_recorded() {
    start_wipe_record();
    {
      let secret = SecretBytes::new(vec![7u8; 32]);
      assert_eq!(secret.as_slice()[0], 7);
    }
    let log = take_wipe_record();
    assert_eq!(log, vec![32]);
  }
}
