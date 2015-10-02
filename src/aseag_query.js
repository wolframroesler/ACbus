var query_url_base = 'http://ivu.aseag.de/interfaces/ura/instant_V1?ReturnList=';
var query_url_bus = query_url_base + 'StopPointName,LineName,DestinationName,EstimatedTime&StopID=';
var query_url_stops = query_url_base + 'StopPointName,StopID,Longitude,Latitude';

var xhrRequest = function( url, type, callback ) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function() {
        callback( this.responseText );
    };
    xhr.open( type, url );
    xhr.send( null );
};

function degToRad( angleInDeg ) {
    return angleInDeg / 180.0 * Math.PI;
}

function distance( lon1, lat1, lon2, lat2 ) {
    var R = 6371000; // earth mean radius
    var phi1 = degToRad( lat1 );
    var phi2 = degToRad( lat2 );
    var deltaPhi = degToRad( lat2 - lat1 );
    var deltaLambda = degToRad( lon2 - lon1 );

    var a = Math.sin( deltaPhi / 2.0 ) * Math.sin( deltaPhi / 2.0 ) +
            Math.cos( phi1 ) * Math.cos( phi2 ) *
            Math.sin( deltaLambda / 2.0 ) * Math.sin( deltaLambda / 2.0 );
    var c = 2 * Math.atan2( Math.sqrt( a ), Math.sqrt( 1 - a ) );

    var dist = R * c;
    
    return dist; // in meters
}

function parseLines( lines ) {
    return lines.split(/\r?\n/);
}

function parseLine( line ) {
    var parsed = line.slice( 1, line.length - 1 );
    return parsed.split( ',' );
}

function parseBusStops( response_text ) {
    console.log( '[ACbus] Parsing bus stops.' );
    
    var lines = parseLines( response_text );
    var bus_stops = [];
    
    // first item is not a bus stop
    for( var i = 1; i < lines.length; ++i )
    {
        var parsed_line = parseLine( lines[ i ] );
        
        // compare this to the query url for bus stops and its return list params
        var bus_stop = {
            name: parsed_line[ 1 ],
            id:   parsed_line[ 2 ],
            lon:  parsed_line[ 4 ],
            lat:  parsed_line[ 3 ]
        };
        
        bus_stops.push( bus_stop );
    }
    
    console.log( '[ACbus] Parsed ' + bus_stops.length + ' bus stops.' );
    return bus_stops;
}

function findClosestBusStopForCoords( coords ) {
    xhrRequest( query_url_stops, 'GET', function( response_text ) {
        var bus_stops = parseBusStops( response_text );
        
        var closest_index = -1;
        var closest_dist = Infinity;
        
        for( var i = 0; i < bus_stops.length; ++i ) {
            var dist = distance( bus_stops[ i ].lon,
                             bus_stops[ i ].lat,
                             coords.longitude,
                             coords.latitude );
            
            if( dist < closest_dist ) {
                closest_index = i;
                closest_dist = dist;
            }
        }
        
        console.log( '[ACbus] Closest bus stop ' + bus_stops[ closest_index ].name +
                     ' found at ' + closest_dist + ' meters distance.' );
        
        var bus_stop = bus_stops[ closest_index ];
        var bus_stop_name = bus_stop.name;
        bus_stop_name = bus_stop_name.slice( 1, bus_stop_name.length - 1 );
        bus_stop_name = bus_stop_name.replace( 'ß', 'ss' );
        bus_stop_name = bus_stop_name.replace( 'ö', 'oe' );
        bus_stop_name = bus_stop_name.replace( 'ä', 'ae' );
        bus_stop_name = bus_stop_name.replace( 'ü', 'ue' );
        var bus_stop_dist = Math.round( closest_dist ).toString();
        var gps_coords = Math.round( coords.longitude, 1 ).toString() + ", " + Math.round( coords.latitude, 1 ).toString();
        
        xhrRequest( query_url_bus + '100000', 'GET', function( response_text ) {
            console.log( '[ACbus] Getting next buses for ' + bus_stop_name );
            
            var bus_lines = parseLines( response_text );
            var busses = [];
            
            console.log( '[ACbus] Found ' + ( bus_lines.length - 1 ) + " busses." );
            
            var global_now = parseLine( bus_lines[ 0 ] )[ 2 ];
            
            for( var i = 1; i < bus_lines.length; ++i ) {
                var bus_line = parseLine( bus_lines[ i ] );
                
                var bus = {
                    number: bus_line[ 2 ],
                    dest:   bus_line[ 3 ],
                    eta:    Math.round( ( bus_line[ 4 ] - global_now ) / ( 1000 * 60 ) )
                };
                
                console.log( i + " #: " + bus.number + ", dest: " + bus.dest + ", eta (mins): " + bus.eta );
                
                busses.push( bus );
            }
            
            var dict = {
                'BUS_STOP_NAME': bus_stop_name,
                'BUS_STOP_DIST': bus_stop_dist,
                'GPS_COORDS': gps_coords
            };
            
            Pebble.sendAppMessage( dict );
            
            console.log( '[ACbus] Send bus stop data issued.' );
        } );
    } );
}

function locationSuccess( pos ) {
    console.log( '[ACbus] Got new location data. Determining closest bus stop.' );
    findClosestBusStopForCoords( pos.coords );
}
 
function locationFailure( err ) {
    console.log( '[ACbus] An error occured while getting new location data. Error: ' + err );
}

function determineClosestBusStop() {
    navigator.geolocation.getCurrentPosition(
        locationSuccess,
        locationFailure,
        { timeout: 15000, maximumAge: 60000 }
    );
}

Pebble.addEventListener( 'ready',
    function( e ) {
        console.log( '[ACbus] Pebble JS ready!' );
        
        determineClosestBusStop();
    } );

Pebble.addEventListener( 'appmessage',
    function( e ) {
        console.log( '[ACbus] AppMessage received!' ) ;
        
        determineClosestBusStop();
    } );
