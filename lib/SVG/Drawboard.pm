package SVG::Drawboard;
our $VERSION = '0.01';

=head1 NAME

SVG::Drawboard - server for a multiplayer SVG whiteboard

=head1 DESCRIPTION

This implements a Javascript client and a Perl server for allowing multi-client
creation and manipulation of sticky notes on an SVG canvas using websockets.

=head1 MESSAGES

The following messages are currently sent:

=head2 SERVER MESSAGES

=over 4

=item config

The configuration data for the current client

This includes the board name and the client display name

=item disconnect

Sent when a different client has disconnected

=back

=head2 CLIENT MESSAGES

=over 4

=item * dragend

=item * dragmove

=item * textedit

Sent by a client whenever an item gets moved or changed

=item * delete

Sent by a client whenever an item is deleted

=item * mouseposition

Sent whenever the client mouse pointer changes position

=back

=head1 LICENSES

This distribution includes the following files:

L<https://github.com/svgdotjs/svg.js|svg.js>

Copyright (c) 2012-2018 Wout Fierens
https://svgdotjs.github.io/

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

L<https://github.com/jillix/svg.draggy.js/|svg.draggy.js>

The MIT License (MIT)

Copyright (c) 2012-16 jillix <contact@jillix.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

=cut

1;
