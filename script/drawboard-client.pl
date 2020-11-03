#!perl
use 5.012;
use Filter::signatures;
use feature 'signatures';
no warnings 'experimental::signatures';

use Scalar::Util 'weaken';
use Mojo::UserAgent;
use Mojo::IOLoop;

#my $ioloop = Mojo::IOLoop->new();
my $ua = Mojo::UserAgent->new(
    #ioloop => $ioloop,
);

my ($base_url,$boardname, $text, $x, $y, $width, $height) = @ARGV;
$x ||= 10;
$y ||= 10;
$width ||= 100;
$height ||= 100;

say "$base_url/uplink";
$ua->websocket("$base_url/uplink"
    #=> { 'Sec-WebSocket-Extensions' => 'permessage-deflate' }
    => ['my.proto']
    => sub {
        my ($ua, $tx) = @_;
        my $promise = Mojo::Promise->new;

        if( ! $tx->is_websocket ) {
            say 'WebSocket handshake failed!';
            #$res->fail('WebSocket handshake failed!');
            return;
        };
        #say 'Subprotocol negotiation failed!' and return unless $tx->protocol;

        $tx->on(finish => sub {
            my ($tx, $code, $reason) = @_;
            #if( $s->_status ne 'shutdown' ) {
            #    say "WebSocket closed with status $code.";
            #};
        });

        #$tx->on(message => sub($tx,$msg) {
        #});
        # kick off the conversation

        my %noteInfo = (
            id => "perl" . time(),
            text => $text,
            x => $x,
            y => $y,
            type    => 'note',
            "color" => 'gray',
            width   => $width || 100,
            height  => $height || 100,
        );

        $tx->on( drain => sub($ws) {
            $ws->finish;
        });

        $tx->send({ json => {
            boardname => $boardname,
            user      => 'automated',
            info      => \%noteInfo,
            id        => $noteInfo{id},
            action    => "dragend",
        }});
});

Mojo::IOLoop->start unless Mojo::IOLoop->is_running;
#$r->get;
