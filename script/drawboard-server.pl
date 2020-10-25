#!perl
use Mojolicious::Lite -signatures;
use Mojolicious::Sessions;
use Mojolicious::Static;
use Mojo::File;
use Mojo::JSON 'decode_json', 'encode_json';

my $sessions = Mojolicious::Sessions->new;
$sessions->cookie_name('drawboard');
$sessions->default_expiration(86400);

# Consider moving this later to Socket.io nomenclature and API
our %rooms;
our %connections;

our $id = 1;
sub generate_session_id {
    $id++;
    warn "Generating new id: $id";
    $id
}

push @{ app->static->paths }, Mojo::File->curfile->dirname->dirname->child('public');

sub fetch_board( $name ) {

    my $board = $rooms{ $name } ||= {
        name => $name,
        listeners => {},
        document => {
            title => 'untitled',
            nodes => {}, # no conflict resolution yet
        },
    };
    $board->{last_active} = time();

    return $board
}

get '/board/:name' => sub($c) {
    my $boardname = $c->param('name');
    #$sessions->load($c);
    #my $id = $sessions->{uid} || generate_session_id();
    #warn "Storing id as uid $id";
    #$sessions->{uid} = $id;
    #$sessions->store($c);

    $c->reply->static('./canvas.html');
};

# We should sanitize $msg here
sub notify_listeners($roomname, $id, $message) {
    # First, store the message locally, for later replay
    # and consolidation of the document

    # Then, broadcast it to the room:
    my $board = fetch_board($roomname);
    my $str = encode_json($message);
    for my $l (keys %{ $board->{listeners} }) {
        next if $l eq $id;

        warn "Sending to $id";
        warn "Connected clients are ", join ",", sort keys %connections;

        my $ok = eval {
            # XXX fixme: Blindly forwarding messages is not nice
            $connections{$l}->send($str);
            1;
        };
        if( ! $ok ) {
            warn "Client error: $@";
            delete $connections{$l};
            delete $board->{listeners}->{$l};
        };
    };
};

websocket '/uplink' => sub($c) {
    $sessions->load($c);
    my $id = $sessions->{uid} || generate_session_id();
    $c->inactivity_timeout(3600);

    $connections{ $id } = $c;

    # Maybe use Mojo::Pg and the Pg "notify" API instead of manually ferrying stuff?

    $c->on(message => sub($c,$msg) {
        $msg = decode_json($msg);
        my $info = $msg->{info};
        use Data::Dumper; warn Dumper $msg;
        my $boardname = $msg->{boardname};
        my $action = $msg->{action};

        if( 'subscribe' eq $action ) {
            my $board = fetch_board( $boardname );
            $board->{listeners}->{$id} = $c;
            warn "Subscribed clients for [$boardname] are ", join ",", sort keys %{ $board->{listeners} };
        } else {
            warn "Notifying '$boardname' listeners about $action";
            notify_listeners($boardname, $id, $msg)
        };
    });

    $c->on(finish => sub(@foo) {
        warn "Disconnected $id";
        my( $c ) = @foo;
        delete $connections{ $id };
    });
};

# have a reaper that goes through the unused boards and serializes them

app->start();
