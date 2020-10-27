create table drawboard_items (
    drawboard  varchar(64),
    item       varchar(64),
    action     varchar(16),
    properties varchar(1024), -- a JSON string, eww
    timestamp  datetime DEFAULT CURRENT_TIMESTAMP
);

-- Create an index so we can easily pick the latest action for each item
create index idx_drawboard_items_latest
    on drawboard_items(drawboard,timestamp,item);
