"use strict";

let svg;
// Set by the "config" message, below
let config = {};
let users = {};
let uplink;
let boardname;
let documentInfo;

function initDrawboard(svgId) {
    let el;
    for( el of document.querySelectorAll('.nojs')) {
        console
        el.style.visibility = 'hidden';
    };

    svg = SVG(svgId).size("100%", 900);
    //var links = svg.group();
    //var markers = svg.group();
    //var defs = svg.defs();

    let loc = window.location;
    let href = loc.href;

    let parts = href.match(/^http(s?):\/\/(.*\/)([\w\.-]+)$/);
    if(! parts) {
        console.log("Don't understand the URL '"+href+"'");
    };

    let ws_uri = 'ws' + parts[1] + "://" + parts[2] + '../uplink';
    console.log("Connecting to " + ws_uri);
    uplink = new WebSocket(ws_uri);
    boardname = parts[3];
    documentInfo = {
        dimensions: new SVG.Box(0,0,1,1),
    };

    uplink.onmessage = onMessage
    uplink.onopen = (event) => {
        uplink.send(JSON.stringify({
            'action': 'subscribe',
            'boardname': boardname,
        }));
        console.log("Connected, subscribing");

        // Connect up the rest of the UI
        selectTool("selector");
        setupMinimap("thumbview");
    };
};

function onMessage(event) {
    //console.log(event.data);
    let msg;
    try {
        msg = JSON.parse(event.data);
    } catch (e) {
        console.log("JSON parse error:",e);
        return;
    };

    if( msg.boardname == boardname ) {
        // console.log(msg.action);
        if( /^(dragend|dragmove|textedit)$/.test(msg.action)) {
            // Last edit wins
            // We need to handle the user selection
            let oldOverlay = SVG.get("overlay");
            let moveOverlay = false;
            if( oldOverlay ) {
                let containedId = oldOverlay.data("overlaid");
                moveOverlay = containedId === msg.info.id;
            };

            makeNote(svg,msg.info);
            if( moveOverlay ) {
                addSelectionOverlay(svg, msg.info.id);
            };

        } else if( "delete" === msg.action ) {
            deleteItems(svg, [msg.info.id], false);

        } else if( "mouseposition" === msg.action ) {
            let user = makeUser(svg, msg.info);
            // Animate instead of teleporting?!
            if( user.animation ) {
                user.animation.finish();
            };
            // Make cursor topmost
            let scale = 1/svg.viewbox().zoom;
            //user.animation
            //    = user.pointer.animate(10).move( msg.info.x, msg.info.y );
            user.pointer.scale(scale);
            user.pointer.x(msg.info.x);
            user.pointer.y(msg.info.y);

        } else if( "disconnect" === msg.action ) {
            console.log("Delete user", msg);
            deleteUser( svg, msg.info );

        } else if( "config" === msg.action ) {
            updateConfig(msg.info);
        };
    };
}

function updateConfig(aConfig) {
    config = aConfig;
    document.title = config.boardname + " - Drawboard";
}

// generic message throttler generator
// Returns a function that will throttle
function mkThrottledBroadcaster(delay,keycols) {
    // Our information about the last messages sent
    // Later, clean out message keys after 1s (or whatever) to prevent
    // bloating the list of last messages sent
    let lastItem = {};
    return (msg) => {
        let key = (keycols.map( (k) => { msg[k] } )).join("\0");

        let info = lastItem[key];
        if( ! info) {
            info = lastItem[key] = {};
        };

        info.latestMsg = msg;

        if( ! info.timerId ) {
            uplink.send(JSON.stringify(msg));
            info.latestMsg = undefined;

            info.timerId = window.setTimeout(() => {
                if( info.latestMsg ) {
                    uplink.send(JSON.stringify(info.latestMsg));
                    info.latestMsg = undefined;
                };
                info.timerId = undefined;
            }, delay);
        };
    }
};

// debounce/throttle here, and on the server too
let throttledBroadcastClientCursor = mkThrottledBroadcaster(100,[]);
function broadcastClientCursor(x,y) {
    let lastPos = { "x":x, "y":y };
    throttledBroadcastClientCursor({
            info: lastPos,
            user: config.username,
            action: "mouseposition",
            "boardname": boardname,
    });
}

let throttledBroadcastNoteState = mkThrottledBroadcaster(100,["id"]);
function broadcastNoteState(noteInfo,eventname) {
    // Debounce this just like client cursors, except keyed on the note id
    // as well.
    throttledBroadcastNoteState({
        info: noteInfo,
        id: noteInfo.id,
        user: config.username,
        action: eventname,
        "boardname": boardname,
    });
}

/*
// Later, precompile the templates, maybe in an external file even
var template = {
    //note: '<g id="{{id}}" transform="matrix(1,0,0,1,{{x}},{{y}})"><rect id="SvgjsRect1011" width="53.53333282470703" height="23" x="0" y="-8" fill="white" stroke="black"></rect><text id="SvgjsText1009" font-family="Helvetica, Arial, sans-serif" fill="#e91e63" opacity="0.6" svgjs:data="{&quot;leading&quot;:&quot;1.3&quot;}"><tspan id="SvgjsTspan1010" x="0" y="10" fill="crimson" font-weight="bold">{{text}}</tspan></text></g>'
    note: '<rect width="53.53333282470703" height="23" x="0" y="-8" fill="yellow" stroke="black"></rect><text font-family="Helvetica, Arial, sans-serif" fill="#e91e63" opacity="0.6" svgjs:data="{&quot;leading&quot;:&quot;1.3&quot;}"><tspan id="SvgjsTspan1010" x="0" y="10" fill="crimson" font-weight="bold">{{text}}</tspan></text>'
};
*/

function leaveEditingMode() {
    if( state_editedNode ) {
        let editedNode = SVG.get(state_editedNode);
        if( ! editedNode.node.contains( event.target )) {
            console.log("Left editing note",state_editedNode);
            let bb = SVG.select('.main', editedNode.node).first().bbox();
            let info = getNoteInfo(editedNode);
            let textdiv = SVG.select('div', state_editedForeign.node).first();
            info.text = textdiv.node.innerText;
            state_editedForeign.remove();

            // Now, find the lines in the content, and have them as TSPAN
            // Insert the text word-by-word into a (hidden, otherwise identical)
            // div and whenever the .height changes, create a new TSPAN.

            updateNote(svg, editedNode, info);
            state_editedNode = undefined;
        };
    };
}

let modeTool;
function selectTool(tool) {
    let callback;
    let cursor;

    leaveEditingMode();

    modeTool = tool;
    switch (tool) {
        case "selector":
            svg.node.style.setProperty('cursor','default');
            callback = (e) => {
                leaveEditingMode();

                if( e.target === svg.node ) {
                    removeSelectionOverlay(svg);
                };
            };
            break;

        case "makeNote":
            svg.node.style.setProperty('cursor','crosshair');
            callback = (e) => {
                let pt = new SVG.Point(e.clientX, e.clientY);
                let documentLoc = pt.transform(new SVG.Matrix(svg.node.getScreenCTM().inverse()));
                let note = makeNote(svg, {
                    x : documentLoc.x,
                    y : documentLoc.y,
                    width : 100,
                    height : 100,
                    text: "enter text",
                });
                addSelectionOverlay(svg,note.attr('id'));
                // XXX directly enter text entry mode?

                /* reset cursor and tool */
                selectTool("selector");
            };
            break;
    }

    if( callback ) {
        svg.off("click");
        svg.on("click", callback);
    } else {
        // Can we always switch off the callback? This conflicts with
        // the normal selection ...
        svg.off("click");
    };
}

function svgUsedRange(svg) {
    let bbox = new SVG.BBox();
    let children = svg.children();
    let el;
    children.forEach( (el) =>{
        bbox = bbox.merge( el.bbox() );
    });
    return bbox;
}

// Set up the thumbview command(s)
function setupMinimap(id) {
    let DOMminimap = document.getElementById(id);
    let minimap = new SVG(id);
    DOMminimap.onclick = (e) => {
        let pt = new SVG.Point(e.clientX, e.clientY);
        let documentLoc = pt.transform(new SVG.Matrix(minimap.node.getScreenCTM().inverse()));

        // Move the main view accordingly
        // XXX We really want to move the center of the viewbox, not the top
        //     left corner, I guess
        let vb = svg.viewbox();
        let mb = minimap.viewbox();

        // Scale the click position from the minimap to the viewbox

        let movedViewBox = {x:documentLoc.x,y:documentLoc.y,width:vb.width,height:vb.height};
        svg.viewbox(movedViewBox.x,movedViewBox.y,movedViewBox.width,movedViewBox.height);

        // Broadcast our new viewbox
    };
};

// Hotkeys
document.onkeydown = (e) => {
    e = e || window.event;
    // use e.keyCode
    console.log(e.keyCode);

    if( "selector" === modeTool ) {
        switch(e.keyCode) {
            case 78: // "N" - makeNote
                     selectTool("makeNote");
                     break;
            // "B" - showNavigationPane
            // "<space>" - (while held down) selectPanTool

            case 46: // del
                    deleteCurrentSelection();
                    break;

        };
    };

    //console.log(e.keyCode);
};

let isPanning;
let panStartPoint;
let panStartViewbox;
document.onmousemove = (e) => {
    if( svg.node.contains(e.target) ) {
        // Convert from clientX/clientY to position in SVG
        let pt = new SVG.Point(e.clientX, e.clientY);
        let documentLoc = pt.transform(new SVG.Matrix(svg.node.getScreenCTM().inverse()));

        if (isPanning){
            let vb = panStartViewbox;
            let dx = (panStartPoint.x - e.x)/vb.zoom;
            let dy = (panStartPoint.y - e.y)/vb.zoom;
            let movedViewBox = {x:vb.x+dx,y:vb.y+dy,width:vb.width,height:vb.height};
            svg.viewbox(movedViewBox.x,movedViewBox.y,movedViewBox.width,movedViewBox.height);
            // broadcastClientViewbox
        } else {
            broadcastClientCursor(documentLoc.x, documentLoc.y);
        };
    };
};

document.onmousedown = (e) => {
    if( e.which === 2) { // Middle button pans
        isPanning = true;
        panStartPoint = {x:e.x,y:e.y};
        panStartViewbox = svg.viewbox();
    };
}

document.onmouseup = (e) => {
    if( e.which === 2) { // Middle button pans
        isPanning = false;
    };
}

document.onwheel = function(e) {
    if( svg.node.contains(e.target) ) {
        e.preventDefault();
        let viewbox = svg.viewbox();

        // One scroll event means 5% change in zoom
        let scale = 1 + Math.sign(e.deltaY) * 0.05;

        // Why doesn't viewbox inherit from SVG.Box?!
        let b = new SVG.Box(viewbox);
        b = b.transform(new SVG.Matrix(scale,0,0,scale, 0,0));

        let pt = new SVG.Point(e.clientX, e.clientY);
        let documentLoc = pt.transform(new SVG.Matrix(svg.node.getScreenCTM().inverse()));
        b.x -= (documentLoc.x * (scale-1));
        b.y -= (documentLoc.y * (scale-1));
        svg.viewbox(b);

        let oldOverlay = SVG.get("overlay");
        if( oldOverlay ) {
            let containedId = oldOverlay.data("overlaid");
            addSelectionOverlay(svg, containedId);
        };
        // broadcastClientViewport();
    };
    // Otherwise, handle it as default
}

function deleteItems(svg,items,local) {
    let oldOverlay = SVG.get("overlay");
    let containedId;
    if( oldOverlay ) {
        containedId = oldOverlay.data("overlaid");
    };

    for( let id of items ) {
        let item = SVG.get(id);
        if( item ) {
            if( local ) {
                let info = getNoteInfo(item); // for undo
                broadcastNoteState(info,'delete');
            };
            item.remove();

            if( containedId === id ) {
                oldOverlay.remove();
            };
        };
    };
}

// Go through all notes (or all SVG elements?) and update our bounding box
function recalculateDocumentDimensions(svg) {
    let res;

    for( let child of svg.children()) {
        if( ! res ) {
            res = child.bbox();
        } else {
            res = res.merge( child.bbox());
        }
    }
    return res
}

function deleteCurrentSelection() {
    let oldOverlay = SVG.get("overlay");
    if( oldOverlay ) {
        let containedId = oldOverlay.data("overlaid");
        deleteItems(svg, [ containedId ], true);
        oldOverlay.remove();
    };
}

function colorCurrentSelection() {
    let overlay = SVG.get("overlay");
    if( overlay ) {
        let containedId = overlay.data("overlaid");
        let item = SVG.get(containedId);
        let noteInfo = getNoteInfo(item);
        noteInfo.color = config.usercolor;
        updateNote(svg,containedId, noteInfo);
    };
}

function removeSelectionOverlay(svg1) {
    let oldOverlay = SVG.get("overlay");
    if( oldOverlay ) {
        let containedId = oldOverlay.data("overlaid");
        let contained = SVG.get(containedId);

        if( contained ) {
            let pos = new SVG.Matrix(contained);

            oldOverlay.remove();

            // Move the contained object into the correct position
            contained.transform(pos);

            contained.removeClass('overlaid');
        } else {
            console.log("Item with id '" + containedId + "' went away ?!");
            oldOverlay.remove();
        };
    };
};

function addSelectionOverlay(svg1,singleItem) {
    // remove old overlay, if any:
    removeSelectionOverlay(svg1);

    let scale = 1/svg.viewbox().zoom;

    let item = SVG.get(singleItem);
    if( ! item ) {
        console.log("No item found for id '"+singleItem+"' (?!)");
    };
    let mainItem = SVG.select('.main',item.node).first();
    let bb = mainItem.bbox();
    let overlay = svg.group().attr({"id":"overlay"});
    item.addClass('overlaid');

    overlay.data("overlaid",item,true); // We want to store an object reference

    // Add eight svg.circle() as handles for sizing the selection
    let w = svg.circle(8*scale);
    w.center(0+item.x(),item.y()+bb.h/2);
    w.draggy((x,y) => {
        return {"x":x,"y":false}
    });
    overlay.add(w);

    let e = svg.circle(8*scale);
    e.center(bb.w+item.x(),item.y()+bb.h/2);
    e.draggy((x,y) => {
        return {"x":x,"y":false}
    });
    overlay.add(e);

    let n = svg.circle(8*scale);
    n.center(bb.w/2+item.x(),item.y()+0);
    n.draggy((x,y) => {
        return {"x":false,"y":y}
    });
    overlay.add(n);

    let s = svg.circle(8*scale);
    s.center(bb.w/2+item.x(),item.y()+bb.h);
    s.draggy((x,y) => {
        return {"x":false,"y":y}
    });
    overlay.add(s);

    let nw = svg.circle(8*scale);
    nw.center(0+item.x(),0+item.y());
    nw.draggy((x,y) => {
        return {"x":x,"y":y}
    });
    overlay.add(nw);

    let ne = svg.circle(8*scale);
    ne.center(item.x()+bb.w,0+item.y());
    ne.draggy((x,y) => {
        return {"x":x,"y":y}
    });
    overlay.add(ne);

    let se = svg.circle(8*scale);
    se.center(item.x()+bb.w,bb.h+item.y());
    se.draggy((x,y) => {
        return {"x":x,"y":y}
    });
    overlay.add(se);

    let sw = svg.circle(8*scale);
    sw.center(item.x()+0,bb.h+item.y());
    sw.draggy((x,y) => {
        return {"x":x,"y":y}
    });
    overlay.add(sw);

    // Also, log any moving, for later communication
    let dragmove_side = (event) => {
        let item = SVG.get(singleItem);
        let noteInfo = getNoteInfo(item);

        // Reconstruct width/height, then set it
        let newbb = {'w':e.cx()-w.cx(),'h':s.cy()-n.cy()};
        //console.log(e,newbb.w);
        noteInfo.width = newbb.w;
        noteInfo.height = newbb.h;
        noteInfo.x = w.cx();
        noteInfo.y = n.cy();
        //console.log(newbb.w);
        let newNote = makeNote(svg,noteInfo);

        let info = {
            from : { x: null, y: null },
            to   : { x: event.detail.event.pageX, y: event.detail.event.pageY }
        };

        item = newNote;

        // Adjust the four corner handles
        nw.center(item.x(),        item.y());
        ne.center(item.x()+newbb.w,item.y());
        sw.center(item.x(),        item.y()+newbb.h);
        se.center(item.x()+newbb.w,item.y()+newbb.h);

        // Adjust the four side handles
        n.center(item.x()+newbb.w/2,item.y()        );
        s.center(item.x()+newbb.w/2,item.y()+newbb.h);
        w.center(item.x()        ,  item.y()+newbb.h/2);
        e.center(item.x()+newbb.w,  item.y()+newbb.h/2);

        broadcastNoteState(noteInfo,'dragmove');
    };

    let dragmove_corner = (event) => {
        let item = SVG.get(singleItem);
        let noteInfo = getNoteInfo(item);

        let info = {
            from : { x: null, y: null },
            to   : { x: event.detail.event.pageX, y: event.detail.event.pageY }
        };

        // Find which handle we moved, and adjust the two neighbouring
        // handles accordingly...
        if( event.target === nw.node ) {
            sw.cx( nw.cx() );
            ne.cy( nw.cy() );
        };
        if( event.target === ne.node ) {
            nw.cy( ne.cy() );
            se.cx( ne.cx() );
        };
        if( event.target === sw.node ) {
            nw.cx( sw.cx() );
            se.cy( sw.cy() );
        };
        if( event.target === se.node ) {
            ne.cx( se.cx() );
            sw.cy( se.cy() );
        };

        let newbb = {'w':ne.cx()-nw.cx(),'h':sw.cy()-ne.cy()};
        noteInfo.width = newbb.w;
        noteInfo.height = newbb.h;
        noteInfo.x = nw.cx();
        noteInfo.y = nw.cy();

        let newNote = makeNote(svg,noteInfo);
        item = newNote;

        // Adjust the four side handles
        n.center(item.x()+newbb.w/2,item.y()        );
        s.center(item.x()+newbb.w/2,item.y()+newbb.h);
        w.center(item.x()        ,  item.y()+newbb.h/2);
        e.center(item.x()+newbb.w,  item.y()+newbb.h/2);

        broadcastNoteState(noteInfo,'dragmove');
    };

    n.on("dragmove", dragmove_side );
    e.on("dragmove", dragmove_side );
    s.on("dragmove", dragmove_side );
    w.on("dragmove", dragmove_side );

    nw.on("dragmove",dragmove_corner);
    sw.on("dragmove",dragmove_corner);
    ne.on("dragmove",dragmove_corner);
    se.on("dragmove",dragmove_corner);

    // Scale the toolbar inverse to our zoom, so the size in pixels remains
    let obb = overlay.bbox(); // Adjust for sides of the viewbox, later
    let toolbar = svg.use("toolbar");
    let tbb = toolbar.bbox();
    overlay.add(toolbar);
    toolbar.cx(obb.x + (obb.width-tbb.width) / 2);
    toolbar.y(obb.y - tbb.height - 8*scale);
    toolbar.scale(scale);
    let icon = svg.select( ".currentcolor", toolbar).first();
    icon.fill(config.usercolor);

    let layer = SVG.get('displayLayerUI');
    layer.add(overlay);

    return overlay
}

function getNoteInfo( note ) {
    let t = SVG.select('.text', note.node).first();
    let bb = SVG.select('.main', note.node).first().bbox();
    let color = SVG.select('.main', note.node).first().attr('fill');
    return {
        type   : 'note',
        id     : note.attr('id'),
        text   : t.text(),
        "color": color,
        x      : note.x(),
        y      : note.y(),
        width  : bb.width,
        height : bb.height
    };
}

// Creates or replaces a user mouse pointer
function makeUser(svg, info ) {
    if( ! users[ info.uid ]) {
        let g = svg.group();
        let svgUsername = svg.text((t) => { t.tspan(info.username) });
        svgUsername.fill(info.usercolor);
        svgUsername.move(16,0);
        g.add( svg.circle(8).fill(info.usercolor));
        g.add( svgUsername );

        let layer = SVG.get('displayLayerCursors');
        layer.add(g);

        users[ info.uid ] = {
            pointer: g,
            animation: undefined,
            color: info.usercolor,
        };
    };
    return users[ info.uid ];
}

function deleteUser( svg, info ) {
    if( users[ info.uid ]) {
        users[ info.uid ].pointer.remove();
        delete users[ info.uid ];
    };
}

// Creates or replaces a note
function makeNote(svg, attrs) {

    let t = svg.text((t) => {
        t.tspan(attrs.text).attr({"fill":"black","font-weight":"bold"});
    });
    t.addClass('text');
    let color = attrs.color || '#ffef40';
    let b = svg.rect().attr({"fill":color}).size(attrs.width,attrs.height);
    b.addClass('main');
    let bb = b.bbox();

    var g = svg.group();
    g.add(b);
    g.add(t);

    // Text is allowed to bleed out of the "paper"
    t.center(bb.cx,bb.cy);
    g.move(attrs.x, attrs.y);

    t.on('click', startTextEditing);

    g.on("mousedown", (event) => {
        // We only want to select with the (primary) mouse button
        if( event.which === 1 ) {
            let overlay = addSelectionOverlay(svg, g.attr('id'));
        };
    });

    g.draggy();
    g.beforedrag = (e) => {
        // We only want to drag with the (primary) mouse button
        return e.which === 1
    };
    let dragging;
    g.on("dragstart", (event) => {
        dragging = true;
    });
    g.on("dragend", (event) => {
        if( dragging ) {
            addSelectionOverlay(svg, event.target.instance.attr('id'));
            let nodeInfo = getNoteInfo(event.target.instance);
            broadcastNoteState(nodeInfo,'dragend');
        };
    });
    g.on("dragmove", (event) => {
        if( dragging ) {
            addSelectionOverlay(svg, event.target.instance.attr('id'));
            let nodeInfo = getNoteInfo(event.target.instance);
            broadcastNoteState(nodeInfo,'dragmove');
        };
    });

    if( attrs.id ) {
        let oldNode = SVG.get(attrs.id);
        if( oldNode && oldNode.parent() ) {
            if( oldNode === g ) {
                console.log("Old and new node are identical?!");
            } else {
                // console.log("Replacing old item", oldNode, g);
                oldNode.replace( g );
            };
        };
        g.attr('id', attrs.id);
    } else {
        // Assign our prefix here to prevent collisions with other clients
        g.id(config.connection_prefix+"-"+g.id());
    };

    let layer = SVG.get('displayLayerNotes');
    layer.add(g);
    return g
}

function updateNote(svg, note, attrs) {
    // console.log("Switched out of text editing", event.target);
    console.log("Updating note with", attrs);
    let newNote = makeNote( svg, attrs );
    broadcastNoteState(getNoteInfo(newNote),'textedit');
    return newNote;
};

let state_editedNode;
let state_editedForeign;
function startTextEditing( event ) {
        // If we were already editing a different object, quit doing that
        leaveEditingMode();

        // move a HTML contenteditable div in place, let the user edit it
        // If there is a click outside, update the text from the div
        console.log("Editing");
        // Overlay the "paper" we write on
        let t = event.target.instance;
        let note = t.parent(SVG.G);
        note.fixed();
        let bb = SVG.select('.main', note.node).first().bbox();

        let myforeign = svg.element('foreignObject');
        myforeign.attr({
            "width" : bb.width + "px",
            "height" : bb.height + "px",
        });

        let textdiv = document.createElement("div");
        let textspan = document.createElement("div");
        let textnode = document.createTextNode(t.text());
        textdiv.setAttribute("contentEditable", "true");
        textdiv.classList.add("insideforeign"); //to make div fit text
        textdiv.appendChild(textspan);
        textspan.appendChild(textnode);

        // XXX We would like to center on the tspan, or whatever?!
        let transform = new SVG.Matrix(t);
        note.add(myforeign);
        myforeign.transform(transform);
        myforeign.node.appendChild(textdiv);
        state_editedNode = note.attr('id');
        state_editedForeign = myforeign;

        // selectTool() will detect that we left text editing mode
        // and perform the proper updating
};

function mkNote(svg,nodeInfo) {
    let id = nodeInfo.id;
    let g = makeNote(svg, nodeInfo);
    return g;
}

function mkNodes(nodes) {
    for (let node of nodes) {
        switch (node.type) {
            case "note":
                mkNote(svg,node);
                break;
            default:
                console.log("Unknown node type " + node.type, node);
                break;
        }
    }
}

function createNote() {
    let e = event || window.event;
    mkNote(svg, {
        text: "Your text",
        x: e.clientX,
        y: e.clientY - 200,
        width: 100,
        height: 100,

    });
}

function exportAsSvg() {
    var svg_blob = new Blob([svg.svg()],
                            {'type': "image/svg+xml"});
    var url = URL.createObjectURL(svg_blob);
    window.location = url;
    // var svg_win = window.open(url, "svg_win");
}

// console.log(telems);

// Data at rest:
// Notes (text-rectangles) (and all other svg-objects) in one array
// Data for transfer:
// Create X
// Change node type (=Template)
// How will we handle connectors/arrows?
// How will we handle templates? Handlebars?
// Communication: socket.io or just hand-rolled? Currently hand-rolled
//     https://socket.io/docs/client-api/
//     https://github.com/socketio/socket.io-protocol
// How will we handle the selection of multiple elements?!
/*
 * Next steps:
 *     Separate the main viewbox and the document into two SVG elements
 *         This allows the minimap to have a secondary view onto the document
 *         Overlay the UI in the main viewbox, not in the document
 *         (this means the UI won't show up in the minimap)
 *     Add "loading" animation while initializing
 *     Implement rendering of multiple <TSPAN> lines properly
 *     Implement handling of multiline input into <TSPAN>
 *     Implement white-black-white border around (single) selected item(s)
 *     Implement moving notes to back/front
 *     Implement (local) undo
 *     Implement editing layers, or at least a background layer
 *         We'll need at least two editing layers:
 *         Notes etc.
 *         Background (only selectable in a special mode)
 *     Implement defined zones where you can one-click to move/zoom to
 *     Implement (note) context menus
 *     Implement (inline) images
 *     Implement command line client for uploading images
 *     Implement (server-side) images
 *     Implement note color (using <input type="color> preferrably)
 *     Implement touch support for handles
 *     Implement touch support for moving an element (separate move handle)
 *     Implement support for rotation
 *     Implement tool modes beyond "select" and "create"
 *     Implement touch support for rotating (separate rotation handle)
 *     Implement download of the SVG, and download of a JSON describing the SVG
 *     Implement replay/reupload of the SVG from the JSON describing the SVG
 *     Implement upload of random SVGs (?)
 *     Create item from template
 *     Implement "join as guest" gateway page that asks for username and password
 *     Implement permissions
 *     Implement read-only permissions
 *     Implement edit-only-own-stuff permissions
 *     Implement editor permissions
 *     Implement local chat
 *     Implement dynamic sizing etc. of the toolbar
 *     Update the minimap viewbox whenever the used document range of the
 *       document changes
 *     Update the minimap with the currently displayed client range
 *     Don't pan the minimap
 *     The UI should remain fixed (on the SVG board) while panning
 *     Separate the board-URL from the boardname
 *     Reconnect the websocket upon disconnect - how will we synch up then?
 *         a) Transfer the current server state, losing all local edits
 *         b) better sync, from the time of last sync onwards, in both
 *            directions. This will be hard.
 *     Remove the selection UI if the selection is discarded by clicking on the
 *       canvas itself
 */

// Bugs
/*
 *     * [ ] We can't handle multiline text when editing
 *           Fixing this likely requires parsing .text() for newlines,
 *           converting between these and <tspan> objects
 *     * [ ] We don't handle rearranging the z-order of items at all
 *     * [ ] Delete key always deletes the note, even in text editing mode
 *
 */
