-- ocr_cache.key_version — record which OCR_CACHE_KEY_VERSION sealed each row (PR C).
--
-- The dedicated OCR cache key (PR A, ocrCacheCrypto) binds a key VERSION as AES-GCM
-- AAD and stores it in the sealed envelope. Persist it so a read can reconstruct the
-- envelope and so a key rotation can fail-closed on rows sealed under an old version
-- (a wrong-version row decrypts to a cache MISS + a security metric, never a serve).
--
-- Additive + idempotent. Existing rows (sealed under the wizard-ledger crypto, pre-PR-C)
-- get NULL; the secure store treats a NULL/mismatched version as a cache MISS.

alter table public.ocr_cache
  add column if not exists key_version text;

comment on column public.ocr_cache.key_version is
  'OCR_CACHE_KEY_VERSION that sealed this row (bound as AES-GCM AAD). NULL ⇒ legacy/unknown ⇒ treated as a cache miss on read (fail-closed).';
