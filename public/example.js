"use strict";

var svg = SVG('svg1').size("100%", 900);
var links = svg.group();
var markers = svg.group();
let nodes = [];
var defs = svg.defs();

// Later, precompile the templates, maybe in an external file even
var template = {
    //note: '<g id="{{id}}" transform="matrix(1,0,0,1,{{x}},{{y}})"><rect id="SvgjsRect1011" width="53.53333282470703" height="23" x="0" y="-8" fill="white" stroke="black"></rect><text id="SvgjsText1009" font-family="Helvetica, Arial, sans-serif" fill="#e91e63" opacity="0.6" svgjs:data="{&quot;leading&quot;:&quot;1.3&quot;}"><tspan id="SvgjsTspan1010" x="0" y="10" fill="crimson" font-weight="bold">{{text}}</tspan></text></g>'
    note: '<rect width="53.53333282470703" height="23" x="0" y="-8" fill="white" stroke="black"></rect><text id="SvgjsText1009" font-family="Helvetica, Arial, sans-serif" fill="#e91e63" opacity="0.6" svgjs:data="{&quot;leading&quot;:&quot;1.3&quot;}"><tspan id="SvgjsTspan1010" x="0" y="10" fill="crimson" font-weight="bold">{{text}}</tspan></text>'
};

function mkNote(svg,nodeInfo) {
    let id = nodeInfo.id;

    // Fill the template

    let myTemplate = Handlebars.compile(template['note']);
    let str = myTemplate(nodeInfo);
    //let newNode = SVG(str);
    //let g = svg.group({ id: nodeInfo.id, "x":nodeInfo.x, "y": nodeInfo.y }).draggy();
    //g.add(newNode);

    let t = svg.text((t) => {
        t.tspan(nodeInfo.text).attr({"x":nodeInfo.x, "y":nodeInfo.y,"fill":"crimson","font-weight":"bold"});
    });
    t.fill("#E91E63").opacity(0.6);
    var b = t.bbox();
    var border = svg.rect(b.width, b.height).move(b.x,b.y).attr({"fill":"white","stroke":"black"});
    var g = svg.group().draggy();
    g.add(border);
    g.add(t);

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
