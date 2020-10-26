#!perl
use Mojolicious::Lite -signatures;
use Mojolicious::Sessions;
use Mojolicious::Static;
use Mojo::File;
use Mojo::JSON 'decode_json', 'encode_json';
use DBI;
use DBD::SQLite;
use DBIx::RunSQL;

# in-memory DB, for now
warn "Setting up DB";
my $dbh = DBIx::RunSQL->create(sql => './sql/create.sql', dsn => 'dbi:SQLite:dbname=:memory:');

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
push @{ app->renderer->paths }, Mojo::File->curfile->dirname->dirname->child('templates');

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

get '/' => sub( $c ) {
    return $c->redirect_to('index.html');
};

get '/index' => sub($c) {
    warn "Current boards are " . join ",", map { $rooms{$_} } sort keys %rooms;
    $c->stash(boards => [ map { $rooms{$_} } sort keys %rooms ]);
    $c->render(template => 'index');
};

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
    my $str = encode_json($message);

    # First, store the message locally, for later replay
    # and consolidation of the document
    $dbh->do(<<~SQL, {}, $roomname, $message->{info}->{id}, $message->{action}, $str);
        insert into drawboard_items
               (drawboard,item,action,properties)
        values (?,?,?,?)
    SQL

    # Then, broadcast it to the room:
    my $board = fetch_board($roomname);
    for my $l (keys %{ $board->{listeners} }) {
        next if $l eq $id;

        #warn "Sending to $id";
        #warn "Connected clients are ", join ",", sort keys %connections;

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

sub notify_listener($recipient, $message) {
    use Data::Dumper; warn Dumper $message;
    my $str = encode_json($message);

    my $ok = eval {
            # XXX fixme: Blindly forwarding messages is not nice
        $connections{$recipient}->send($str);
        1;
    };
    if( ! $ok ) {
        warn "Client error: $@";
        delete $connections{$recipient};
    };
};

websocket '/uplink' => sub($c) {
    $sessions->load($c);
    use Data::Dumper; warn Dumper $sessions;
    my $id = $sessions->{uid} || generate_session_id();
    $c->inactivity_timeout(3600);

    $connections{ $id } = $c;
    warn "Client $id connected";

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

            # Bring the client up to speed:
            warn "Fetching Items in '$boardname'";
            #my $sth = $dbh->prepare(<<~SQL);
            #        select drawboard
            #             , item
            #             , properties
            #             , timestamp
            #             , action
            #             , rank() over (partition by drawboard, item order by timestamp desc) as pos
            #          from drawboard_items
            #         where drawboard = ?
            #SQL
            #$sth->execute($boardname);
            #warn DBIx::RunSQL->format_results(sth => $sth);

            my $items = $dbh->selectall_arrayref(<<~SQL, { Slice => {}}, $boardname);
                with drawboard_state as (
                    select drawboard
                         , item
                         , properties
                         , timestamp
                         , action
                         , rank() over (partition by drawboard, item order by timestamp desc) as pos
                      from drawboard_items
                     where drawboard = ?
                )
                select *
                  from drawboard_state
                  where pos = 1
                    and action not in ('delete')
                 order by timestamp
            SQL

            # Assign the user a name and an uid
            notify_listener($id,{ action => "config", "username" => "user$id", uid => $id, boardname => $boardname, info => { "username" => "user$id", uid => $id } });
            for my $item (@$items) {
                notify_listener($id,decode_json($item->{properties}));
            };

        } else {
            #warn "Notifying '$boardname' listeners about $action";
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
