-- Add editor_type column to posts table
ALTER TABLE posts
ADD COLUMN editor_type VARCHAR(20) DEFAULT 'quill' NOT NULL;

-- Update existing rows to default
UPDATE posts SET editor_type = 'quill' WHERE editor_type IS NULL;
