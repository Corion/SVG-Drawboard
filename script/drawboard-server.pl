#!perl
use Mojolicious::Lite -signatures;
use Mojolicious::Sessions;
use Mojolicious::Static;
use Mojo::File 'curfile', 'path';
use Mojo::JSON 'decode_json', 'encode_json';
use DBI;
use DBD::SQLite;
use DBIx::RunSQL;

my ($configfile) = grep { warn $_; -f $_ } map { path("$_/drawboard.conf")->realpath } '.', curfile->dirname;
warn "Config: $configfile";
plugin 'NotYAMLConfig' => { file => $configfile };

# in-memory DB, by default
app->config->{dsn} ||= 'dbi:SQLite:dbname=:memory:';

warn "Setting up DB";
# Maybe load this from the config as well?
my $dbh = DBI->connect(app->config->{dsn}, undef, undef, {RaiseError => 1});
my $exists = eval {
    $dbh->do('select * from drawboard_items where 1=0');
    1
};
if( ! $exists) {
    DBIx::RunSQL->create(sql => './sql/create.sql', dbh => $dbh);
};

#my $sessions = Mojolicious::Sessions->new;
#$sessions->cookie_name('drawboard');
#$sessions->default_expiration(86400);


# Consider moving this later to Socket.io nomenclature and API
our %rooms;
our %connections;

our @usercolors = (
    '#ff0066',
    '#0066ff',
    '#66ff00',
    '#ff6600',
    '#6600ff',
    '#00ff66',
);


{ state $id = 1;
sub generate_session_id {
    $id++;
    warn "Generating new id: $id";
    $id
}
}

our %users;

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

sub listener_disconnected( $recipient_id ) {
    warn "Disconnected $recipient_id";
    delete $connections{ $recipient_id };
    if( my $user = delete $users{ $recipient_id }) {
        my $msg = {
            action => 'disconnect',
            uid => $recipient_id,
            username => $user->{username},
            boardname => $user->{boardname},
            info => {
                %{$user},
            },
        };
        for my $board (values %rooms) {
            delete $board->{listeners}->{$recipient_id};
        };
        notify_listeners($user->{boardname}, $recipient_id, $msg)
    };
}

sub do_notify_listener($recipient_id,$str) {
    my $ok = eval {
        # XXX fixme: Blindly forwarding messages is not nice
        $connections{$recipient_id}->send($str);
        1;
    };
    if( ! $ok ) {
        warn "Client error: $@";
        listener_disconnected($recipient_id);
    };
}

# We should sanitize $msg here
sub notify_listeners($roomname, $id, $message) {
    my $str = encode_json($message);

    # First, store the message locally, for later replay
    # and consolidation of the document
    $dbh->do(<<SQL, {}, $roomname, $message->{info}->{id}, $message->{action}, $str);
        insert into drawboard_items
               (drawboard,item,action,properties)
        values (?,?,?,?)
SQL

    # Then, broadcast it to the room:
    my $board = fetch_board($roomname);
    for my $l (keys %{ $board->{listeners} }) {
        next if $l eq $id;
        warn "User '$id' $message->{action} to $l";

        do_notify_listener($l,$str);
    };
};

sub notify_listener($recipient, $message) {
    my $str = encode_json($message);

    do_notify_listener($recipient,$str);
};

# Stuff that we might not want to store in the DB, or purge more quickly
our %ephemeral_messagetypes = (
    'mouseposition' => 1,
);

websocket '/uplink' => sub($c) {
    #$sessions->load($c);
    #use Data::Dumper; warn Dumper $sessions;
    my $id = generate_session_id();
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

            # Assign the user a name and an uid
            $users{ $id } = {
                "username"        => "user$id",
                uid               => $id,
                boardname         => $boardname, # currently, each user can only be in a single board
                usercolor         => @usercolors[ $id % @usercolors ],
                connection_prefix => $id,
            };
            # warn "User $id gets color " . $users{$id}->{usercolor};
            notify_listener($id,{
                action => "config",
                "username" => "user$id",
                uid => $id,
                boardname => $boardname,
                info => {
                    %{$users{ $id }},
                    boardname => $boardname,
                },
            });

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

            my $items = $dbh->selectall_arrayref(<<SQL, { Slice => {}}, $boardname);
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

            for my $item (@$items) {
                notify_listener($id,decode_json($item->{properties}));
            };

        } else {
            #warn "Notifying '$boardname' listeners about $action";

            # Debounce repeated/similar client mouse cursor movements and
            # rate limit these so we don't flood the other clients

            if( $msg->{action} eq 'mouseposition' ) {
                # do we really want to do this patching all the time or
                # just once upon connection of users in a config broadcast?
                $msg->{info}->{usercolor} = $users{ $id }->{usercolor};
                $msg->{info}->{username}  = $users{ $id }->{username};
                $msg->{info}->{uid} = $id;
            };

            notify_listeners($boardname, $id, $msg)
        };
    });

    $c->on(finish => sub(@foo) {
        my( $c ) = @foo;

        listener_disconnected($id);
    });
};

# have a reaper that goes through the unused boards and serializes them

app->start();
