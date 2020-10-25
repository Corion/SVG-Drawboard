create table drawboard_items (
    drawboard varchar(64),
    item      varchar(64),
    properties varchar(1024), -- a JSON string, eww
    timestamp  datetime DEFAULT CURRENT_TIMESTAMP
);
