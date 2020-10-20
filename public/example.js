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

        let cx = oldOverlay.cx();
        let cy = oldOverlay.cy();
        oldOverlay.replace(contained);

        // Move the contained object into the correct position
        contained.center(cx,cy);

        contained.removeClass('overlaid');
    };

    let item = SVG.get(singleItem);
    let mainItem = SVG.select('.main',item.node).first();

    let bb = mainItem.bbox();
    let overlay = svg.group().attr({"id":"overlay"});
        //.draggy();
    let r = svg.rect();
    r.attr({"stroke":"black", "stroke-width":3, "fill-opacity":0});
    r.size(bb.w+2,bb.h+2);
    r.center(item.cx(),item.cy());
    item.addClass('overlaid');

    overlay.add(item);
    overlay.add(r);
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

    e.on("dragmove", (event) => {
        let info = {
            from : { x: null, y: null },
            to   : { x: event.detail.event.pageX, y: event.detail.event.pageY }
        };

        // Reconstruct width/height, then set it
        let bb = mainItem.bbox();
        let newbb = {'w':e.cx()-w.cx(),'h':bb.h};
        console.log("New", newbb);
        mainItem.size(newbb.w, newbb.h);
        item.move(w.cx(),item.y());

        // now, reposition all drag handles
        // adjust the draggy overlay to cover the real element again
        // do we need the overlay at all?!
    });
    e.on("dragend", (event) => {
        let bb = mainItem.bbox();
        console.log("End dimensions",bb);
    });
    w.on("dragmove", (event) => {
        let info = {
            from : { x: null, y: null },
            to   : { x: event.detail.event.pageX, y: event.detail.event.pageY }
        };

        // Reconstruct width/height, then set it
        let bb = mainItem.bbox();

        // Resize the items _in_ this group, not the group!
        // Do we want special behaviour for each template?!
        // let newbb = {'w':bb.x2-info.to.x,'h':bb.h};
        let newbb = {'w':e.cx()-w.cx(),'h':bb.h};
        mainItem.size(newbb.w, newbb.h);
        item.move(w.cx(),item.y());

        // now, reposition all drag handles
        // adjust the draggy overlay to cover the real element again
        // do we need the overlay at all?!
    });
    overlay.add(w);

    // draggy.constrain() the n,e,s,w circles to move only on their axis
    // line up the corners when dragging the edges, line up the edges when
    // dragging the corners
    // remove the svg.circle() if the current container loses focus
    // Also, log any moving, for later communication

    return overlay
}

function mkNote(svg,nodeInfo) {
    let id = nodeInfo.id;

    // Fill the template
    // We need to do that in code as we have lots of interdependencies here

    //let myTemplate = Handlebars.compile(template['note']);
    //let str = myTemplate(nodeInfo);
    // let newNode = svg.svg(str);

    let t = svg.text((t) => {
        t.tspan(nodeInfo.text).attr({"fill":"black","font-weight":"bold"});
    });
    let b = svg.rect().attr({"fill":"#ffe840"}).size(nodeInfo.width,nodeInfo.height);
    b.addClass('main');
    let bb = b.bbox();

    var g = svg.group().attr({"id":nodeInfo.id});
    g.add(b);
    g.add(t);

    // Text is allowed to bleed out of the "paper"
    t.center(bb.cx,bb.cy);

    g.move(nodeInfo.x, nodeInfo.y);

    // We also need to handle touchstart, see draggy.js source
    // In the middle/long run, we need to ditch draggy completely, so we
    // can add our overlay _and_ drag with a single click
    // Also, editing the text also is broken here, so maybe we need an
    // alltogether different approach
    g.on('mousedown', (event) => {
        let overlay = addSelectionOverlay(svg, nodeInfo.id);
    });

    /*
    g.on('dragmove', function(event) {
        // Broadcast new position, every 0.5 seconds
        var info = {
            from : { x: null, y: null },
            to   : { x: event.detail.event.pageX, y: event.detail.event.pageY }
        };
        //console.log("Moving: "+name+" at ",info,event.detail);
    });
    g.on('dragend', (event) => {
        // Save the new coordinates in the backend
        var info = {
            from : { x: null, y: null },
            to   : { x: event.detail.event.pageX, y: event.detail.event.pageY }
        };
        console.log("Moved: "+name+" to ",info,event.detail);

        // Broadcast new position of item

        // Also update borders around table groups via group.bbox()
        // sizeSection( tableInfo.section );

    });
    */
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
