CREATE TABLE users (
    id            UUID PRIMARY KEY,
    email         VARCHAR(320) UNIQUE,
    password_hash VARCHAR(100),
    display_name  VARCHAR(80) NOT NULL,
    anonymous     BOOLEAN NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE bills (
    id          UUID PRIMARY KEY,
    owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id   VARCHAR(64) NOT NULL,
    title       VARCHAR(200),
    currency    VARCHAR(3) NOT NULL,
    total_minor BIGINT,
    bill_date   DATE,
    status      VARCHAR(16) NOT NULL,
    payload     TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_bills_owner_client UNIQUE (owner_id, client_id)
);
CREATE INDEX idx_bills_owner_updated ON bills(owner_id, updated_at DESC);

CREATE TABLE shares (
    token          VARCHAR(48) PRIMARY KEY,
    owner_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bill_client_id VARCHAR(64) NOT NULL,
    snapshot       TEXT NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked        BOOLEAN NOT NULL
);
CREATE INDEX idx_shares_owner_bill ON shares(owner_id, bill_client_id);

CREATE TABLE share_payments (
    token          VARCHAR(48) NOT NULL REFERENCES shares(token) ON DELETE CASCADE,
    participant_id VARCHAR(64) NOT NULL,
    marked_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    marked_by      VARCHAR(16) NOT NULL,
    PRIMARY KEY (token, participant_id)
);

CREATE TABLE receipts (
    id           UUID PRIMARY KEY,
    owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(64) NOT NULL,
    image        BYTEA NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at   TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_receipts_expiry ON receipts(expires_at);
