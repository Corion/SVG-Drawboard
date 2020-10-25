"use strict";

var svg = SVG('svg1').size("100%", 900);
var links = svg.group();
var markers = svg.group();
let nodes = [];
var defs = svg.defs();

/*
// Later, precompile the templates, maybe in an external file even
var template = {
    //note: '<g id="{{id}}" transform="matrix(1,0,0,1,{{x}},{{y}})"><rect id="SvgjsRect1011" width="53.53333282470703" height="23" x="0" y="-8" fill="white" stroke="black"></rect><text id="SvgjsText1009" font-family="Helvetica, Arial, sans-serif" fill="#e91e63" opacity="0.6" svgjs:data="{&quot;leading&quot;:&quot;1.3&quot;}"><tspan id="SvgjsTspan1010" x="0" y="10" fill="crimson" font-weight="bold">{{text}}</tspan></text></g>'
    note: '<rect width="53.53333282470703" height="23" x="0" y="-8" fill="yellow" stroke="black"></rect><text font-family="Helvetica, Arial, sans-serif" fill="#e91e63" opacity="0.6" svgjs:data="{&quot;leading&quot;:&quot;1.3&quot;}"><tspan id="SvgjsTspan1010" x="0" y="10" fill="crimson" font-weight="bold">{{text}}</tspan></text>'
};
*/

function addSelectionOverlay(svg,singleItem) {

    // remove old overlay, if any:
    let oldOverlay = SVG.get("overlay");
    if( oldOverlay ) {
        let containedId = oldOverlay.data("overlaid");
        let contained = SVG.get(containedId);

        if( contained ) {
            let cx = oldOverlay.cx();
            let cy = oldOverlay.cy();
            oldOverlay.replace(contained);

            // Move the contained object into the correct position
            contained.center(cx,cy);

            contained.removeClass('overlaid');
        } else {
            console.log("Item with id '" + containedId + "' went away ?!");
        };
    };

    let item = SVG.get(singleItem);
    if( ! item ) {
        console.log("No item found for id '"+singleItem+"' (?!)");
    };
    let mainItem = SVG.select('.main',item.node).first();
    let bb = mainItem.bbox();
    let overlay = svg.group().attr({"id":"overlay"});
        //.draggy();
    item.addClass('overlaid');

    overlay.add(item);
    overlay.data("overlaid",item,true); // We want to store an object reference

    // Add eight svg.circle() as handles for sizing the selection
    let w = svg.circle(8);
    w.center(0+item.x(),item.y()+bb.h/2);
    w.draggy((x,y) => {
        return {"x":x,"y":false}
    });
    overlay.add(w);

    let e = svg.circle(8);
    e.center(bb.w+item.x(),item.y()+bb.h/2);
    e.draggy((x,y) => {
        return {"x":x,"y":false}
    });
    overlay.add(e);

    let n = svg.circle(8);
    n.center(bb.w/2+item.x(),item.y()+0);
    n.draggy((x,y) => {
        return {"x":false,"y":y}
    });
    overlay.add(n);

    let s = svg.circle(8);
    s.center(bb.w/2+item.x(),item.y()+bb.h);
    s.draggy((x,y) => {
        return {"x":false,"y":y}
    });
    overlay.add(s);

    let nw = svg.circle(8);
    nw.center(0+item.x(),0+item.y());
    nw.draggy((x,y) => {
        return {"x":x,"y":y}
    });
    overlay.add(nw);

    let ne = svg.circle(8);
    ne.center(item.x()+bb.w,0+item.y());
    ne.draggy((x,y) => {
        return {"x":x,"y":y}
    });
    overlay.add(ne);

    let se = svg.circle(8);
    se.center(item.x()+bb.w,bb.h+item.y());
    se.draggy((x,y) => {
        return {"x":x,"y":y}
    });
    overlay.add(se);

    let sw = svg.circle(8);
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
        noteInfo.width = newbb.w;
        noteInfo.height = newbb.h;
        noteInfo.x = w.cx();
        noteInfo.y = n.cy();
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

        console.log("Moved to", w.cx(), n.cy(), newbb);
    };

    let dragmove_corner = (event) => {
        let item = SVG.get(singleItem);
        let noteInfo = getNoteInfo(item);

        let info = {
            from : { x: null, y: null },
            to   : { x: event.detail.event.pageX, y: event.detail.event.pageY }
        };

        // Reconstruct width/height, then set it
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

        console.log(event);

        // Adjust the four side handles
        n.center(item.x()+newbb.w/2,item.y()        );
        s.center(item.x()+newbb.w/2,item.y()+newbb.h);
        w.center(item.x()        ,  item.y()+newbb.h/2);
        e.center(item.x()+newbb.w,  item.y()+newbb.h/2);
    };

    n.on("dragmove", dragmove_side );
    e.on("dragmove", dragmove_side );
    s.on("dragmove", dragmove_side );
    w.on("dragmove", dragmove_side );

    nw.on("dragmove",dragmove_corner);
    sw.on("dragmove",dragmove_corner);
    ne.on("dragmove",dragmove_corner);
    se.on("dragmove",dragmove_corner);

    // Also, log any moving, for later communication
    // e.on("dragend", (event) => {
    //     let bb = mainItem.bbox();
    //     console.log("End dimensions",bb);
    // });

    return overlay
}

function getNoteInfo( note ) {
    let t = SVG.select('.text', note.node).first();
    let bb = SVG.select('.main', note.node).first().bbox();
    return {
        id     : note.attr('id'),
        text   : t.text(),
        x      : note.x(),
        y      : note.y(),
        width  : bb.width,
        height : bb.height
    };
}

// Creates a note, but does not use the id attribute
function makeNote(svg, attrs) {
    let t = svg.text((t) => {
        t.tspan(attrs.text).attr({"fill":"black","font-weight":"bold"});
    });
    t.addClass('text');
    let b = svg.rect().attr({"fill":"#ffe840"}).size(attrs.width,attrs.height);
    b.addClass('main');
    let bb = b.bbox();

    var g = svg.group();
    g.add(b);
    g.add(t);

    // Text is allowed to bleed out of the "paper"
    t.center(bb.cx,bb.cy);
    g.move(attrs.x, attrs.y);

    t.on('click', startTextEditing);
    g.on('mousedown', (event) => {
        console.log("Selected single group");
        let overlay = addSelectionOverlay(svg, g.attr('id'));
    });

    g.draggy().on("dragend", (event) => {
        console.log("End",event);
        addSelectionOverlay(svg, event.target.instance.attr('id'));
    });
    g.draggy().on("dragmove", (event) => {
        console.log("Move",event);
        addSelectionOverlay(svg, event.target.instance.attr('id'));
    });

    if( attrs.id ) {
        let oldNode = SVG.get(attrs.id);
        if( oldNode ) {
            console.log("Replacing old item " + attrs.id);
            oldNode.replace( g );
        };
        g.attr('id', attrs.id);
    };

    return g
}

// Ideally, recreate the note, instead of patching
// see morphdom, maybe
function updateNote(svg, note, attrs) {
    console.log("Switched out of text editing", event.target);
    console.log("Updating note with", attrs);
    // Actually, we should regenerate our complete node here
    // for consistency, instead of merely updating the text:

    let newNote = makeNote( svg, attrs );
    return newNote;
};

let state_editedNode;
function startTextEditing( event ) {
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

        // Install a listener on svg, which checks if we clicked away from our
        // newly added element, and if so, deletes the element
        svg.off("click"); // Do we really want to wipe all existing listeners?!
        svg.on("click", (event) => {
            // find x,y coordinate, and check if the location is contained
            // in myforeign
            console.log("Click on", event);

            if( state_editedNode ) {
                let editedNode = SVG.get(state_editedNode);
                if( ! editedNode.node.contains( event.target )) {
                    console.log("Left editing note",state_editedNode);
                    let bb = SVG.select('.main', editedNode.node).first().bbox();
                    let info = getNoteInfo(editedNode);
                    info.text = textdiv.textContent;
                    updateNote(svg, editedNode, info);
                    state_editedNode = undefined;
                    svg.off("click");
                };
            };
        });

        // XXX We would like to center on the tspan, or whatever?!
        let transform = new SVG.Matrix(t);
        note.add(myforeign);
        myforeign.transform(transform);
        myforeign.node.appendChild(textdiv);
        state_editedNode = note.attr('id');
};

function mkNote(svg,nodeInfo) {
    let id = nodeInfo.id;
    let g = makeNote(svg, nodeInfo);

    nodes.push(g);
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
// Move X from a to b by (dX, dY)
// Change attribute Y (other than position) on X
// Change node type (=Template)
// Delete X
// How will we handle connectors/arrows?
// How will we handle templates? Handlebars?
// Communication: socket.io or just hand-rolled?
//     https://socket.io/docs/client-api/
//     https://github.com/socketio/socket.io-protocol
// First implementation: Just render a set of data
/*
 * Next steps:
 *     Create item at x,y, { props } via button
 *     Submit item creation at x,y, { props } via socket
 *     Create item at x,y, { props } via socket
 *     Create item from template
 *     Broadcast socket to other clients
 */
