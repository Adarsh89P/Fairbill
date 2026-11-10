-- One link per bill: friends first pick what they ate (claim), later the same link shows the final split.
ALTER TABLE shares ALTER COLUMN snapshot DROP NOT NULL;
ALTER TABLE shares ADD COLUMN claim TEXT;

CREATE TABLE share_picks (
    token          VARCHAR(48) NOT NULL REFERENCES shares(token) ON DELETE CASCADE,
    participant_id VARCHAR(64) NOT NULL,
    item_ids       TEXT NOT NULL,
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (token, participant_id)
);

-- Friends who were not on the payer's list and added themselves from the link.
CREATE TABLE share_guests (
    token          VARCHAR(48) NOT NULL REFERENCES shares(token) ON DELETE CASCADE,
    participant_id VARCHAR(64) NOT NULL,
    name           VARCHAR(80) NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (token, participant_id)
);

-- Optional photo of the original bill, re-encoded on upload so camera metadata (e.g. GPS) is dropped.
CREATE TABLE share_photos (
    token        VARCHAR(48) PRIMARY KEY REFERENCES shares(token) ON DELETE CASCADE,
    content_type VARCHAR(32) NOT NULL,
    image        BYTEA NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL
);
