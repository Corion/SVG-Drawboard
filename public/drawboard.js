"use strict";

let svg;
// Set by the "config" message, below
let config = {};
let users = {};
let state = {
    editedNode    : undefined,
    editedForeign : undefined,
    actionStack   : [],
    actionPrev    : -1,
};
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
        setupMinimap("svgMinimap");
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
        if( /^(make|dragend|dragmove|textedit)$/.test(msg.action)) {
            // Last edit wins
            // We need to handle the user selection
            let oldOverlay = SVG.get("overlay");
            let moveOverlay = false;
            if( oldOverlay ) {
                let containedId = oldOverlay.data("overlaid");
                moveOverlay = containedId === msg.info.id;
            };

            makeShape(svg,msg.info);
            if( moveOverlay ) {
                addSelectionOverlay(svg, msg.info.id);
            };
            updateUIControls(svg);

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

            // Update the client screen rect
            user.viewport.x(msg.info.vx);
            user.viewport.y(msg.info.vy);
            user.viewport.width(msg.info.vwidth);
            user.viewport.height(msg.info.vheight);

        } else if( "disconnect" === msg.action ) {
            console.log("Delete user", msg);
            deleteUser( svg, msg.info );

        } else if( "config" === msg.action ) {
            //SVG.get('displayLayerInitializing').remove();
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
    // Add the viewport to our broadcast
    let vb = svg.viewbox();
    let lastPos = {
        "x":x,
        "y":y,
        "vx" : vb.x,
        "vy" : vb.y,
        "vwidth" : vb.width,
        "vheight" : vb.height,
    };

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
    if( state.editedNode ) {
        let editedNode = SVG.get(state.editedNode);
        if( editedNode && ! editedNode.node.contains( event.target )) {
            console.log("Left editing note",state.editedNode);
            let bb = SVG.select('.main', editedNode.node).first().bbox();
            let info = getNoteInfo(editedNode);
            let oldInfo = { ...info };
            let textdiv = SVG.select('div', state.editedForeign.node).first();
            info.text = textdiv.node.innerText;
            state.editedForeign.remove();

            // Now, find the lines in the content, and have them as TSPAN
            // Insert the text word-by-word into a (hidden, otherwise identical)
            // div and whenever the .height changes, create a new TSPAN.

            if( info.text != oldInfo.text ) {

                addAction('edit text',
                    () => { updateShape(svg, info.id, info); },
                    () => { updateShape(svg, oldInfo.id, oldInfo); },
                );
            };
            state.editedNode = undefined;
        };
    };
}

function addAction(visual,redo,undo) {
    if( state.actionPostion < state.actionStack.length -1 ) {
        state.actionStack.splice(state.actionPostion+1);
    };
    state.actionStack.push({
        "visual": visual,
        "redo": redo,
        "undo": undo,
    });
    state.actionPrev = state.actionStack.length -1;
    console.log(`Action ${state.actionPrev}: ${visual}`);
    redo();
};

let modeTool;
function selectTool(tool) {
    let callback;
    let cursor;

    leaveEditingMode();

    modeTool = tool;
    let modeEvent = "click";
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

                // get/generate a unique id:
                let notes = SVG.select('.typeNote');
                let offset = notes.length();
                let id = `note_${offset}` ;
                while( SVG.get(id)) {
                    offset++;
                    id = `note_${offset}` ;
                };


                let info = {
                    "id" : id,
                    type: "note",
                    x : documentLoc.x,
                    y : documentLoc.y,
                    width : 100,
                    height : 100,
                    text: "enter text",
                };

                addAction('new note',
                    () => {
                        let shape = makeShape(svg, info);
                        broadcastNoteState(shapeInfo,'make');
                    },
                    () => {
                        deleteItems(svg, [ id ], true);
                    }
                );

                // XXX directly enter text entry mode?
                addSelectionOverlay(svg, info.id);
                /* reset cursor and tool */
                selectTool("selector");
            };
            break;

        case "makeLine":
            svg.node.style.setProperty('cursor','crosshair');

            // How can we immediately drag a line if we want to only listen
            // to "click" below? Maybe we need to add a type of event as well?!
            modeEvent = "mousedown";
            callback = (e) => {
                // Well, we only want button 1:
                if( e.which !== 1 ) {
                    svg.off("mouseup");
                    selectTool("selector");
                    return;
                };

                let pt = new SVG.Point(e.clientX, e.clientY);
                let documentLoc = pt.transform(new SVG.Matrix(svg.node.getScreenCTM().inverse()));

                // get/generate a unique id:
                let notes = SVG.select('.typeLine');
                let offset = notes.length();
                let id = `line_${offset}` ;
                while( SVG.get(id)) {
                    offset++;
                    id = `line_${offset}` ;
                };

                let info = {
                    "id" : id,
                    type: "line",
                    startX : documentLoc.x,
                    startY : documentLoc.y,
                    width : 100,
                    text: "enter text",
                };

                svg.on("mousemove", (e) => {
                    let pt = new SVG.Point(e.clientX, e.clientY);
                    let documentLoc = pt.transform(new SVG.Matrix(svg.node.getScreenCTM().inverse()));
                    info.endX = documentLoc.x;
                    info.endY = documentLoc.y;

                    let shape = makeLine(svg, info);

                    // Prevent text selection
                    e.preventDefault();
                });

                svg.on("mouseup", (e) => {
                    let pt = new SVG.Point(e.clientX, e.clientY);
                    let documentLoc = pt.transform(new SVG.Matrix(svg.node.getScreenCTM().inverse()));
                    info.endX = documentLoc.x;
                    info.endY = documentLoc.y;

                    addAction('new line',
                        () => {
                            let shape = makeShape(svg, info);
                            broadcastNoteState(info,'make');
                        },
                        () => {
                            deleteItems(svg, [ id ], true);
                        }
                    );
                    /* reset cursor and tool */
                    svg.off("mousedown");
                    svg.off("mousemove");
                    svg.off("mouseup");
                    selectTool("selector");
                    addSelectionOverlay(svg, info.id);
                });
                // We should allow to cancel drawing the line using "escape"

            };
            break;
    }

    if( callback ) {
        svg.off(modeEvent);
        svg.on(modeEvent, callback);
    } else {
        // Can we always switch off the callback? This conflicts with
        // the normal selection ...
        svg.off(modeEvent);
    };
}

function svgUsedRange(svg) {
    let bbox = new SVG.BBox();
    let children = svg.children();
    let el;
    children.forEach( (el) =>{
        let childbox = el.rbox(svg);
        bbox = bbox.merge( childbox );
    });
    return bbox;
}

// Set up the thumbview command(s)
function setupMinimap(id) {
    let DOMminimap = document.getElementById(id);
    let minimap = new SVG(id);
    let minimapPanning;

    minimap.width( DOMminimap.parentNode.clientWidth );
    minimap.height( DOMminimap.parentNode.clientHeight );

    let doUpdateMinimap = (e) => {
        if( minimapPanning ) {
            let pt = new SVG.Point(e.clientX, e.clientY);
            let documentLoc = pt.transform(new SVG.Matrix(minimap.node.getScreenCTM().inverse()));

            // Move the main view accordingly
            let bb = svg.viewbox();
            let mb = minimap.viewbox();

            let movedViewBox = {
                x:documentLoc.x-bb.width/2,
                y:documentLoc.y-bb.height/2,
                width:bb.width,
                height:bb.height
            };
            setClientViewbox(documentLoc.x, documentLoc.y, movedViewBox);
        };
    };
    DOMminimap.onmousedown = (e) => {
        minimapPanning = true;
        doUpdateMinimap(e);
    };
    DOMminimap.onmouseup = (e) => {
        doUpdateMinimap(e);
        minimapPanning = false;
    };
    DOMminimap.onmousemove = doUpdateMinimap;
};

function getDocSize() {
    let background = svgUsedRange(SVG.get('displayLayerBackground'));
    let shapes     = svgUsedRange(SVG.get('displayLayerNotes'));
    return background.merge(shapes);
}

function updateMinimap() {
    documentInfo.dimensions = getDocSize();
    // update viewport of the minimap accordingly
    let minimap = SVG.get('svgMinimap');
    minimap.viewbox(documentInfo.dimensions);
    let rUserView = SVG.get('userView');

    // Shouldn't we draw the user rectangle here as well?!
}

// Yay, creating our own controls ...
function updateScrollbars() {
    let viewbox = svg.viewbox();
    let docSize = getDocSize();

    docSize = docSize.merge( viewbox );

    /*
     *
     *    [-------|-----------|-----------]          Zoomed out
     *    <-viewbox  <-docsize-> viewbox ->
     *
     *    |----------[------------]-----------|      Zoomed in
     *    <-docsize  <- viewbox ->   docsize->
     *
     */

    let H = SVG.get('uiScrollbarH');
    let pH = SVG.get('uiScrollposH');
    let widgetWidth = 12 / viewbox.zoom;
    H.height( widgetWidth );
    H.width( viewbox.width - widgetWidth );
    H.x( viewbox.x );
    H.y( viewbox.y + viewbox.height - H.height() );

    let V = SVG.get('uiScrollbarV');
    let pV = SVG.get('uiScrollposV');
    V.height( viewbox.height - widgetWidth );
    V.width( widgetWidth );
    V.x( viewbox.x + viewbox.width - V.width() );
    V.y( viewbox.y );

    let viewable = {
        width : Math.max( H.width()  * viewbox.width  / docSize.width,  1 ),
        height: Math.max( V.height() * viewbox.height / docSize.height, 1 ),
        // relative X and Y positions need to be shifted by negative offsets
        x     : (viewbox.x - docSize.x) / docSize.width  * H.width(),
        y     : (viewbox.y - docSize.y) / docSize.height * V.height(),
    };

    pH.height( 12 / viewbox.zoom );
    pH.width( viewable.width );
        //left corner + scaled distance
    pH.x( viewbox.x   + viewable.x );
    pH.y( viewbox.y + viewbox.height - pH.height() );

    pV.width( 12 / viewbox.zoom );
    pV.height( viewable.height );
    pV.y( viewbox.y + viewable.y );
    pV.x( viewbox.x + viewbox.width - pV.width() );
}

function updateUIControls() {
    updateMinimap();
    updateScrollbars();
    console.log(getDocSize());
}

function setClientViewbox(cursorX, cursorY, newViewBox) {
        svg.viewbox(newViewBox);

        updateScrollbars();

        // Broadcast the new client rectangle
        broadcastClientCursor(cursorX, cursorY);
}

// Hotkeys
document.onkeydown = (e) => {
    e = e || window.event;
    // console.log(e.keyCode);

    if( "selector" === modeTool && ! state.editedNode ) {
        switch(e.keyCode) {
            case 78: // "N" - makeNote
                     selectTool("makeNote");
                     break;
            // "B" - showNavigationPane
            // "<space>" - (while held down) selectPanTool

            case 89:
            case 90: // "Z","Y" - undo (we only support azerty/qwerty/qwertz here)
                     console.log(e);
                     if( e.key.toUpperCase() === "Z" && e.ctrlKey ) {
                         // undo
                         if( state.actionPrev > -1 ) {
                            console.log(`undoing ${state.actionPosition}: '${state.actionStack[state.actionPrev].visual}'`);
                            state.actionStack[state.actionPrev].undo();
                            state.actionPrev--;
                        };
                     } else if(e.key.toUpperCase() === "Y" && e.ctrlKey) {
                         // redo
                         let actionNext = state.actionPrev+1;
                         if( actionNext <= state.actionStack.length -1) {
                            console.log(`redoing ${actionNext}: '${state.actionStack[actionNext].visual}'`);
                            state.actionStack[actionNext].redo();
                            state.actionPrev = actionNext;
                         };
                     };
                     if( state.actionPrev > -1 ) {
                         console.log( `Next undoable action: ${state.actionStack[state.actionPrev].visual}`);
                     } else {
                         console.log( 'No undoable action');
                     };
                     break;
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
            setClientViewbox(documentLoc.x, documentLoc.y, movedViewBox);
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
        svg.node.style.setProperty('cursor','grabbing');
    };
}

document.onmouseup = (e) => {
    if( e.which === 2) { // Middle button pans
        isPanning = false;
        svg.node.style.setProperty('cursor','default');
    };
}

document.onwheel = function(e) {
    // let svg = new SVG('svgUI');
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
        updateScrollbars();
        broadcastClientCursor(documentLoc.x, documentLoc.y);
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
    updateUIControls(svg);
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
        let shapeInfo = getShapeInfo(item);
        shapeInfo.color = config.usercolor;
        updateShape(svg,containedId, shapeInfo);
    };
}

function chooseColorCurrentSelection() {
    let overlay = SVG.get("overlay");
    if( overlay ) {
        let containedId = overlay.data("overlaid");
        let item = SVG.get(containedId);
        let shapeInfo = getShapeInfo(item);
        let colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = shapeInfo.color;
        colorPicker.href = '#';
        colorPicker.onchange = (e) => {
            if( colorPicker.value != shapeInfo.color ) {
                let prevInfo = { ...shapeInfo };
                shapeInfo.color = colorPicker.value;
                addAction('set color',
                    () => {
                        updateShape(svg,containedId, shapeInfo);
                    },
                    () => {
                        updateShape(svg,containedId, prevInfo);
                    }
                );

                let icon = svg.select( ".currentcolor", toolbar).first();
                if( icon ) {
                    icon.fill(shapeInfo.color);
                };
            };
        };
        colorPicker.click();
        colorPicker.remove();
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
        console.log("No item found to select by name", singleItem);
        return;
    };

    let shapeInfo = getShapeInfo(item);
    let mainItem = SVG.select('.main',item.node).first();
    let bb = mainItem.bbox();
    let overlay = svg.group().attr({"id":"overlay"});
    item.addClass('overlaid');

    overlay.data("overlaid",item,true); // We want to store an object reference

    if( shapeInfo.type === 'line' ) {
        let s = svg.circle(8*scale).attr({'cursor':'resize'});
        s.center(shapeInfo.startX, shapeInfo.startY);
        s.draggy();
        overlay.add(s);

        let dragDims;
        s.on("dragstart", (e) => {
            dragDims = ['startX','startY'];
        });
        let dragmove = (e) => {
            let newDims = getShapeInfo(SVG.get(singleItem));
            let pt = new SVG.Point(e.detail.event.clientX, e.detail.event.clientY);
            let documentLoc = pt.transform(new SVG.Matrix(svg.node.getScreenCTM().inverse()));
            newDims[ dragDims[0]] = documentLoc.x;
            newDims[ dragDims[1]] = documentLoc.y;

            let newLine = makeLine( svg, newDims );

            broadcastNoteState(newDims,'dragmove');
            updateUIControls(svg);
        };
        s.on("dragmove", dragmove);
        s.on("dragend",  dragmove);

        let e = svg.circle(8*scale).attr({'cursor':'resize'});
        e.center(shapeInfo.endX, shapeInfo.endY);
        e.draggy();
        overlay.add(e);
        e.on("dragstart", (e) => {
            dragDims = ['endX','endY'];
        });
        e.on("dragmove", dragmove);
        e.on("dragend",  dragmove);

    } else if( shapeInfo.type === 'note') {
        // Rectangular selection overlay, for non-line shapes

        // Add eight svg.circle() as handles for sizing the selection
        let w = svg.circle(8*scale).attr({'cursor':'w-resize'});
        w.center(0+item.x(),item.y()+bb.h/2);
        w.draggy((x,y) => {
            return {"x":x,"y":false}
        });
        overlay.add(w);

        let e = svg.circle(8*scale).attr({'cursor':'e-resize'});
        e.center(bb.w+item.x(),item.y()+bb.h/2);
        e.draggy((x,y) => {
            return {"x":x,"y":false}
        });
        overlay.add(e);

        let n = svg.circle(8*scale).attr({'cursor':'n-resize'});
        n.center(bb.w/2+item.x(),item.y()+0);
        n.draggy((x,y) => {
            return {"x":false,"y":y}
        });
        overlay.add(n);

        let s = svg.circle(8*scale).attr({'cursor':'s-resize'});
        s.center(bb.w/2+item.x(),item.y()+bb.h);
        s.draggy((x,y) => {
            return {"x":false,"y":y}
        });
        overlay.add(s);

        let nw = svg.circle(8*scale).attr({'cursor':'nw-resize'});
        nw.center(0+item.x(),0+item.y());
        nw.draggy((x,y) => {
            return {"x":x,"y":y}
        });
        overlay.add(nw);

        let ne = svg.circle(8*scale).attr({'cursor':'ne-resize'});
        ne.center(item.x()+bb.w,0+item.y());
        ne.draggy((x,y) => {
            return {"x":x,"y":y}
        });
        overlay.add(ne);

        let se = svg.circle(8*scale).attr({'cursor':'se-resize'})
        se.center(item.x()+bb.w,bb.h+item.y());
        se.draggy((x,y) => {
            return {"x":x,"y":y}
        });
        overlay.add(se);

        let sw = svg.circle(8*scale).attr({'cursor':'sw-resize'})
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
            updateUIControls(svg);
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
            updateUIControls(svg);
        };

        n.on("dragmove", dragmove_side );
        e.on("dragmove", dragmove_side );
        s.on("dragmove", dragmove_side );
        w.on("dragmove", dragmove_side );

        nw.on("dragmove",dragmove_corner);
        sw.on("dragmove",dragmove_corner);
        ne.on("dragmove",dragmove_corner);
        se.on("dragmove",dragmove_corner);

        let dragend = () => {
            let currInfo = getNoteInfo(SVG.get(singleItem));
            addAction('scale',
                () => { makeNote(svg, currInfo )},
                () => { makeNote(svg, noteInfo )},
            );
        };
        n.on("dragend", dragend );
        e.on("dragend", dragend );
        s.on("dragend", dragend );
        w.on("dragend", dragend );
        nw.on("dragend",dragend );
        sw.on("dragend",dragend );
        ne.on("dragend",dragend );
        se.on("dragend",dragend );
    };

    // Scale the toolbar inverse to our zoom, so the size in pixels remains
    let obb = overlay.bbox(); // Adjust for sides of the viewbox, later
    let toolbar = svg.use("toolbar");
    let tbb = toolbar.bbox();
    overlay.add(toolbar);
    toolbar.cx(obb.x + (obb.width-tbb.width) / 2);
    toolbar.y(obb.y - tbb.height - 8*scale);
    toolbar.scale(scale);
    let icon = svg.select( ".currentcolor", toolbar).first();
    icon.fill(shapeInfo.color);

    let layer = SVG.get('displayLayerUI');
    layer.add(overlay);

    return overlay
}

function getShapeInfo( shape ) {
    if( shape.hasClass('typeLine')) {
        return getLineInfo( shape )
    } else if( shape.hasClass( 'typeNote' )) {
        return getNoteInfo( shape )
    } else {
        console.log("Unknown shape",shape);
        return;
    };
}

function getLineInfo( line ) {
    let t = SVG.select('.text', line.node).first();
    let bb = line.bbox();
    let points = SVG.select('.main', line.node).first().array();
    let color = SVG.select('.main', line.node).first().attr('stroke');
    return {
        type   : 'line',
        id     : line.attr('id'),
        text   : t.text(),
        "color": color,
        startX : line.x() + points.value[0][0],
        startY : line.y() + points.value[0][1],
        endX   : line.x() + points.value[1][0],
        endY   : line.y() + points.value[1][1],
        width  : 1,
    };
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

        let minimap = SVG.get('displayLayerMinimap');
        let r = minimap.rect(info.vx, info.vy, info.vwidth, info.vheight);
        r.attr({
            "stroke"       : info.usercolor,
            "stroke-width" : "4",
            "stroke-dasharray":"5.10.5",
            "fill-opacity" : 0,
        });

        users[ info.uid ] = {
            pointer  : g,
            animation: undefined,
            viewport : r,
            color    : info.usercolor,
        };
    };
    return users[ info.uid ];
}

function deleteUser( svg, info ) {
    if( users[ info.uid ]) {
        if( users[ info.uid ].pointer) {
            users[ info.uid ].pointer.remove();
        };
        users[ info.uid ].pointer.remove();
        if(users[ info.uid ].viewport) {
            users[ info.uid ].viewport.remove();
        };
        delete users[ info.uid ];
    };
}

// Returns a list of strings by measuring a TSPAN elements in the target TEXT
// element wrapping either on \n or word-wrap on the width

//     let lines = wrapText(textElement, textElement.width, 'Hello World');
function wrapText(target,width,text) {
    let words = text.split(/\s+/);
    // We always (re)wrap ...
    // Later, keep newlines as hard breaks
    let lines = [];
    let line = '';
    let measure = target.tspan('');
    while( words.length ) {
        let word = words.shift();
        measure.clear();
        measure.text(`${line} ${word}`);
        let w = measure.length();
        if(    word !== "\n" && w <= width ) {
            if( line !== '' ) {
                line += " ";
            };
            line += word;
        } else {
            // Output this line
            measure.clear();
            lines.push(line);
            line = '';
            if( word !== "\n" ) {
                line = word;
            };
        };
    };
    // Output the remaining accumulated text
    if( line !== "" ) {
        lines.push(line);
    };
    // Clean up
    measure.clear();
    // measure.remove(); // this fails for an unknown reason
    return lines;
}

// Creates or replaces a note
function makeNote(svg, attrs) {

    // We create the text element first so our hand-rolled word wrapping
    // works with the correct font parameters
    let t = svg.text('').attr({"fill":"black","font-weight":"bold"});
    t.addClass('text');
    let text = wrapText(t, attrs.width, attrs.text).join("\n");
    t.text(text);
    let color = attrs.color || '#ffef40';
    let b = svg.rect().attr({"fill":color,
        "filter":"url(#shadow)",
    }).size(attrs.width,attrs.height);
    b.addClass('main');
    let bb = b.bbox();

    var g = svg.group();
    g.addClass('userElement');
    g.addClass('typeNote'); // Maybe as data element instead?!
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
    let oldNoteState = attrs;
    g.on("dragstart", (event) => {
        dragging = true;
    });
    g.on("dragend", (event) => {
        if( dragging ) {
            addSelectionOverlay(svg, event.target.instance.attr('id'));
            let nodeInfo = getNoteInfo(event.target.instance);

            if(    nodeInfo.x != attrs.x
                || nodeInfo.y != attrs.y ) {
                addAction('move/scale',
                    () => { makeNote(svg, nodeInfo )},
                    () => { makeNote(svg, attrs )},
                );

                broadcastNoteState(nodeInfo,'dragend');
                updateUIControls(svg);
            };
        };
    });
    g.on("dragmove", (event) => {
        if( dragging ) {
            addSelectionOverlay(svg, event.target.instance.attr('id'));
            let nodeInfo = getNoteInfo(event.target.instance);
            broadcastNoteState(nodeInfo,'dragmove');
            updateUIControls(svg);
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

    updateUIControls(svg);

    return g
}

function makeShape( svg, attrs ) {
    switch( attrs.type ) {
        case "line": return makeLine( svg, attrs );
                     break;
        case "note": return makeNote( svg, attrs );
                     break;
        default:
                     console.log("Unknown shape type", attrs);
                     return;
    }
}

function updateShape(svg, shape, attrs) {
    console.log("Updating shape with", attrs);
    let newShape = makeShape( svg, attrs );
    broadcastNoteState(getShapeInfo(newShape),'textedit');
    return newShape;
}

// Creates or replaces a line
function makeLine(svg, attrs) {

    // We create the text element first so our hand-rolled word wrapping
    // works with the correct font parameters
    let t = svg.text('').attr({"fill":"black","font-weight":"bold"});
    t.addClass('text');
    let text = wrapText(t, attrs.width, attrs.text).join("\n");
    t.text(text);
    let color = attrs.color || '#ffef40';
    let leftUpper = {
        x : Math.min(attrs.startX, attrs.endX),
        y : Math.min(attrs.startY, attrs.endY),
    };
    let l = svg.line(
                attrs.startX-leftUpper.x,
                attrs.startY-leftUpper.y,
                attrs.endX-leftUpper.x,
                attrs.endY-leftUpper.y
            ).stroke({ width: 1, "color":color });
    l.addClass('main');
    let bb = l.bbox();

    var g = svg.group();
    g.addClass('userElement');
    g.addClass('typeLine'); // Maybe as data element instead?!
    g.add(l);
    g.add(t);
    g.move(leftUpper.x, leftUpper.y);

    // Text is allowed to bleed out of the "paper"
    t.center(bb.cx,bb.cy);

    // t.on('click', startTextEditing);

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
    let oldShapeState = attrs;
    g.on("dragstart", (event) => {
        dragging = true;
    });
    g.on("dragend", (event) => {
        if( dragging ) {
            let id = event.target.instance.attr('id');
            addSelectionOverlay(svg, id);
            let shapeInfo = getShapeInfo(event.target.instance);

            if(    shapeInfo.startX != attrs.startX
                || shapeInfo.startY != attrs.startY
                || shapeInfo.endX != attrs.endX
                || shapeInfo.endY != attrs.endY
              ) {
                addAction('move/scale',
                    () => { updateShape(svg, id, shapeInfo ); },
                    () => { updateShape(svg, id, attrs )},
                );

                // broadcastNoteState(getShapeInfo(newShape),'dragend');
                updateUIControls(svg);
            };
        };
    });
    g.on("dragmove", (event) => {
        if( dragging ) {
            addSelectionOverlay(svg, event.target.instance.attr('id'));
            let shapeInfo = getShapeInfo(event.target.instance);
            broadcastNoteState(shapeInfo,'dragmove');
            updateUIControls(svg);
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

    updateUIControls(svg);

    return g
}

function startTextEditing( event ) {
        // If we were already editing a different object, quit doing that
        leaveEditingMode();

        // move a HTML contenteditable div in place, let the user edit it
        // If there is a click outside, update the text from the div
        console.log("Editing");
        // Overlay the "paper" we write on
        let t = event.target.instance;
        let note = t.parent(SVG.G);
        let text = t.parent(SVG.Text);
        note.fixed();
        let bb = SVG.select('.main', note.node).first().bbox();

        let myforeign = svg.element('foreignObject');
        myforeign.attr({
            "width" : bb.width + "px",
            "height" : bb.height + "px",
        });

        let textdiv = document.createElement("div");
        let fontInfo = window.getComputedStyle(text.node, null);
        textdiv.style.fontFamily = fontInfo.fontFamily;
        textdiv.style.fontStyle = fontInfo.fontStyle;
        textdiv.style.fontWeight = fontInfo.fontWeight;
        textdiv.style.fontSize = fontInfo.fontSize;
        let textnode = document.createTextNode(text.text());
        textdiv.setAttribute("contentEditable", "true");
        textdiv.classList.add("insideforeign"); //to make div fit text
        textdiv.appendChild(textnode);

        // XXX We would like to center on the tspan, or whatever?!
        let transform = new SVG.Matrix(t);
        note.add(myforeign);
        myforeign.transform(transform);
        myforeign.node.appendChild(textdiv);
        state.editedNode = note.attr('id');
        state.editedForeign = myforeign;

        // selectTool() will detect that we left text editing mode
        // and perform the proper updating
};

function mkNodes(nodes) {
    for (let node of nodes) {
        makeShape(svg,node);
    }
}

function exportAsSvg(svgId) {
    let svg = SVG.get(svgId);

    // Clean up
    let cursors = SVG.get('displayLayerCursors', svg);
    let prev = cursors.previous();
    cursors.remove();
    let UI = SVG.get('displayLayerUI', svg);
    UI.remove();

    // Export
    let svg_blob = new Blob([svg.svg()],
                            {'type': "image/svg+xml"});
    let url = URL.createObjectURL(svg_blob);

    let link = document.createElement('a');
    link.download = config.boardname + ".svg";
    link.href = url;
    link.click();
    link.remove();

    // Restore the document again
    prev.after(cursors);
    cursors.after(UI);
};

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
 *     Add "line" as a shape, after "note"
 *         Look at SVG line shapes "(-" , "<-" and ">-"
 *     Add "connector" as a shape
 *     Add "loading" animation while initializing
 *     Shapes:
 *         - text (like a note, except without the background)
 *         - circle, ellipse (like a note, except round)
 *         - line / connector
 *     Implement rendering of multiple <TSPAN> lines properly
 *     Implement handling of multiline input into <TSPAN>
 *     Implement white-black-white border around (single) selected item(s)
 *     Implement moving notes to back/front
 *     Implement editing layers, or at least a background layer
 *         We'll need at least two editing layers:
 *         Notes/Shapes etc.
 *         Background (only selectable in a special mode)
 *     Implement defined "bookmark" zones where you can one-click to move/zoom to
 *         Would these live on the background? Or get their own layer
 *     Implement (note) context menus
 *         "Send to background layer"
 *         "Send to foreground layer"
 *         "move to back"
 *         "move to front"
 *         "move forward"
 *         "move backward"
 *     Implement (inline) images
 *     Implement command line client for uploading images
 *     Implement (server-side) images
 *     Implement touch support for handles
 *     Implement touch support for moving an element (separate move handle)
 *     Implement support for rotation
 *     Implement tool modes beyond "select" and "create"
 *         Paste-color for example
 *     Implement touch support for rotating (separate rotation handle)
 *     Implement download of the SVG, and download of a JSON describing the SVG
 *         This can be done by constructing the SVG client-side and then eliminating
 *         the UI layer and the cursor layer, or on the server by simply
 *         replaying/placing all the active parts.
 *     Implement JS-free download of the SVG
 *     Exported SVG should have all elements visible and be zoomed out
 *     Implement replay/reupload of the SVG from the JSON describing the SVG
 *     Implement upload of random SVGs (?)
 *     Create shape from template
 *         database table template
 *         person template
 *     Implement "join as guest" gateway page that asks for username and password
 *     Implement permissions
 *     Implement read-only permissions
 *     Implement edit-only-own-stuff permissions
 *     Implement editor permissions
 *     Implement local chat
 *         This is the emergency fallback thing to use if the sidechannel voice
 *         chat breaks down. Alternatively, people could just put up a sticky
 *         note instead.
 *     Implement dynamic sizing etc. of the toolbar
 *     The UI should remain fixed (on the SVG board) while panning
 *     Separate the board-URL from the boardname
 *     Reconnect the websocket upon disconnect - how will we synch up then?
 *         a) Transfer the current server state, losing all local edits
 *         b) better sync, from the time of last sync onwards, in both
 *            directions. This will be hard.
 *     Multi-note selection should scale the notes by using a matrix to scale
 *     Consider https://github.com/tabler/tabler-icons for the toolbar icons
 *     Add zoom+ and zoom- (and 100%) buttons besides the minimap
 *     Minimum zoom/maximum zoom?
 *     Add scrollbars to the border of the SVG for better scrolling
 *     Make font identical between <text><tspan> and foreign divs
 *     Make tspans left/center/right-justifiable per-note
 *     Have example background templates
 *         Kanban
 *         SWOT
 *         Business Canvas
 *     Automatically choose the text color based on the background brightness
 */

// Bugs
/*
 *     * [ ] We can't handle multiline text when editing
 *           Fixing this likely requires parsing .text() for newlines,
 *           converting between these and <tspan> objects
 *     * [ ] We don't handle rearranging the z-order of items at all
 *     * [ ] Delete key always deletes the note, even in text editing mode
 *     * [ ] A note with empty text can't be clicked to add text again
 *     * [ ] Single-line text is centered, multiline text is left-aligned
 *
 */
