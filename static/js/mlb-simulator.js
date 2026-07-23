(function () {
    'use strict';

    var UI_BUILD = 'mlb-simulator-eventlog-rosterstate-20260723';
    if (typeof console !== 'undefined' && console.info) console.info('MLB Simulator UI build: ' + UI_BUILD);

    var CURRENT_TEAMS = [
        ['current-ari', 'Arizona Diamondbacks', 'ARI', 'NL', 'West', 102, 99, 98, 98, 1.03],
        ['current-atl', 'Atlanta Braves', 'ATL', 'NL', 'East', 108, 103, 104, 101, 1.05],
        ['current-bal', 'Baltimore Orioles', 'BAL', 'AL', 'East', 106, 101, 100, 100, 1.04],
        ['current-bos', 'Boston Red Sox', 'BOS', 'AL', 'East', 101, 97, 96, 97, 1.06],
        ['current-chc', 'Chicago Cubs', 'CHC', 'NL', 'Central', 101, 100, 99, 100, 1.01],
        ['current-cws', 'Chicago White Sox', 'CWS', 'AL', 'Central', 90, 88, 89, 88, 1.08],
        ['current-cin', 'Cincinnati Reds', 'CIN', 'NL', 'Central', 100, 96, 96, 97, 1.07],
        ['current-cle', 'Cleveland Guardians', 'CLE', 'AL', 'Central', 99, 104, 102, 106, 0.96],
        ['current-col', 'Colorado Rockies', 'COL', 'NL', 'West', 94, 87, 87, 89, 1.14],
        ['current-det', 'Detroit Tigers', 'DET', 'AL', 'Central', 99, 102, 103, 100, 0.99],
        ['current-hou', 'Houston Astros', 'HOU', 'AL', 'West', 104, 101, 100, 101, 1.01],
        ['current-kc', 'Kansas City Royals', 'KC', 'AL', 'Central', 100, 103, 103, 100, 0.98],
        ['current-laa', 'Los Angeles Angels', 'LAA', 'AL', 'West', 96, 92, 92, 92, 1.07],
        ['current-lad', 'Los Angeles Dodgers', 'LAD', 'NL', 'West', 114, 107, 106, 105, 1.03],
        ['current-mia', 'Miami Marlins', 'MIA', 'NL', 'East', 89, 90, 91, 90, 1.05],
        ['current-mil', 'Milwaukee Brewers', 'MIL', 'NL', 'Central', 101, 104, 102, 105, 0.97],
        ['current-min', 'Minnesota Twins', 'MIN', 'AL', 'Central', 101, 100, 100, 100, 1.02],
        ['current-nym', 'New York Mets', 'NYM', 'NL', 'East', 103, 100, 99, 101, 1.03],
        ['current-nyy', 'New York Yankees', 'NYY', 'AL', 'East', 109, 104, 103, 104, 1.02],
        ['current-ath', 'Athletics', 'ATH', 'AL', 'West', 94, 91, 91, 91, 1.08],
        ['current-phi', 'Philadelphia Phillies', 'PHI', 'NL', 'East', 107, 105, 106, 102, 1.01],
        ['current-pit', 'Pittsburgh Pirates', 'PIT', 'NL', 'Central', 94, 97, 99, 95, 1.04],
        ['current-sd', 'San Diego Padres', 'SD', 'NL', 'West', 103, 101, 101, 100, 1.02],
        ['current-sf', 'San Francisco Giants', 'SF', 'NL', 'West', 98, 99, 99, 99, 1.00],
        ['current-sea', 'Seattle Mariners', 'SEA', 'AL', 'West', 98, 106, 107, 103, 0.98],
        ['current-stl', 'St. Louis Cardinals', 'STL', 'NL', 'Central', 99, 98, 97, 99, 1.01],
        ['current-tb', 'Tampa Bay Rays', 'TB', 'AL', 'East', 100, 102, 101, 103, 0.98],
        ['current-tex', 'Texas Rangers', 'TEX', 'AL', 'West', 104, 98, 97, 98, 1.06],
        ['current-tor', 'Toronto Blue Jays', 'TOR', 'AL', 'East', 101, 101, 101, 100, 1.00],
        ['current-wsh', 'Washington Nationals', 'WSH', 'NL', 'East', 93, 92, 92, 92, 1.06]
    ];

    var HISTORICAL_TEAMS = [
        ['classic-1927-nyy', '1927 New York Yankees', 'NYY', 1927, 124, 112, 110, 101, 1.08],
        ['classic-1939-nyy', '1939 New York Yankees', 'NYY', 1939, 121, 118, 114, 106, 1.00],
        ['classic-1955-bkn', '1955 Brooklyn Dodgers', 'BKN', 1955, 113, 105, 103, 104, 1.04],
        ['classic-1961-nyy', '1961 New York Yankees', 'NYY', 1961, 118, 109, 107, 104, 1.07],
        ['classic-1969-nym', '1969 New York Mets', 'NYM', 1969, 100, 114, 116, 107, 0.94],
        ['classic-1975-cin', '1975 Cincinnati Reds', 'CIN', 1975, 115, 106, 103, 105, 0.98],
        ['classic-1984-det', '1984 Detroit Tigers', 'DET', 1984, 112, 111, 108, 110, 0.97],
        ['classic-1986-nym', '1986 New York Mets', 'NYM', 1986, 110, 112, 111, 106, 0.97],
        ['classic-1988-lad', '1988 Los Angeles Dodgers', 'LAD', 1988, 99, 112, 113, 108, 0.95],
        ['classic-1995-atl', '1995 Atlanta Braves', 'ATL', 1995, 104, 116, 119, 107, 0.93],
        ['classic-1998-nyy', '1998 New York Yankees', 'NYY', 1998, 113, 113, 110, 111, 0.95],
        ['classic-2001-sea', '2001 Seattle Mariners', 'SEA', 2001, 112, 110, 106, 111, 0.96],
        ['classic-2004-bos', '2004 Boston Red Sox', 'BOS', 2004, 114, 104, 103, 106, 1.04],
        ['classic-2016-chc', '2016 Chicago Cubs', 'CHC', 2016, 108, 114, 113, 108, 0.96],
        ['classic-2017-hou', '2017 Houston Astros', 'HOU', 2017, 116, 108, 107, 106, 1.02],
        ['classic-2019-wsh', '2019 Washington Nationals', 'WSH', 2019, 108, 105, 109, 100, 1.05],
        ['classic-2020-lad', '2020 Los Angeles Dodgers', 'LAD', 2020, 116, 112, 110, 110, 0.98],
        ['classic-2021-atl', '2021 Atlanta Braves', 'ATL', 2021, 106, 103, 104, 104, 1.04],
        ['classic-2022-hou', '2022 Houston Astros', 'HOU', 2022, 109, 114, 113, 112, 0.95],
        ['classic-2023-tex', '2023 Texas Rangers', 'TEX', 2023, 115, 101, 102, 99, 1.08]
    ];

    // EMERGENCY FALLBACK ONLY. Regenerated from the live MLB Stats API active
    // rosters + real 2026 season pitching stats on 2026-06-28. This is shown ONLY
    // when a team's live active-roster feed fails to load; when used, the UI flags
    // it as an emergency profile and the reason is logged (see currentPitchersForTeam).
    // Never treated as authoritative current data: live roster always overrides.
    var CURRENT_PITCHERS = {
        ARI: [['gallen', "Zac Gallen", 78, 6.15], ['rodriguez', "Eduardo Rodriguez", 124, 2.27], ['kelly', "Merrill Kelly", 82, 5.84], ['cabrera', "Jose Cabrera", 108, 3.6], ['clarke', "Taylor Clarke", 127, 2.04]],
        ATH: [['springs', "Jeffrey Springs", 85, 5.52], ['ginn', "J.T. Ginn", 114, 3.15], ['civale', "Aaron Civale", 91, 5.05], ['jump', "Gage Jump", 127, 2.04], ['perkins', "Jack Perkins", 80, 6]],
        ATL: [['elder', "Bryce Elder", 103, 4.01], ['sale', "Chris Sale", 127, 2.05], ['holmes', "Grant Holmes", 104, 3.96], ['perez', "Martín Pérez", 116, 3], ['lopez', "Reynaldo López", 110, 3.47]],
        BAL: [['bradish', "Kyle Bradish", 106, 3.77], ['baz', "Shane Baz", 100, 4.31], ['rogers', "Trevor Rogers", 92, 4.99], ['young', "Brandon Young", 114, 3.11], ['gibson', "Trey Gibson", 84, 5.64]],
        BOS: [['early', "Connelly Early", 109, 3.59], ['suarez', "Ranger Suarez", 118, 2.83], ['gray', "Sonny Gray", 116, 2.95], ['tolle', "Payton Tolle", 118, 2.78], ['bennett', "Jake Bennett", 112, 3.27]],
        CHC: [['imanaga', "Shota Imanaga", 99, 4.4], ['rea', "Colin Rea", 94, 4.8], ['peterson', "David Peterson", 81, 5.86], ['assad', "Javier Assad", 103, 4.04], ['boyd', "Matthew Boyd", 91, 5.02]],
        CIN: [['abbott', "Andrew Abbott", 105, 3.9], ['burns', "Chase Burns", 123, 2.36], ['singer', "Brady Singer", 90, 5.12], ['lowder', "Rhett Lowder", 94, 4.81], ['lodolo', "Nick Lodolo", 85, 5.59]],
        CLE: [['williams', "Gavin Williams", 106, 3.81], ['bibee', "Tanner Bibee", 106, 3.78], ['cecconi', "Slade Cecconi", 101, 4.18], ['cantillo', "Joey Cantillo", 105, 3.87], ['messick', "Parker Messick", 120, 2.67]],
        COL: [['lorenzen', "Michael Lorenzen", 78, 6.83], ['sugano', "Tomoyuki Sugano", 94, 4.8], ['freeland', "Kyle Freeland", 78, 7.5], ['feltner', "Ryan Feltner", 99, 4.42], ['herget', "Jimmy Herget", 103, 4.05]],
        CWS: [['martin', "Davis Martin", 116, 3], ['kay', "Anthony Kay", 98, 4.5], ['burke', "Sean Burke", 107, 3.71], ['fedde', "Erick Fedde", 100, 4.34], ['hudson', "Bryan Hudson", 126, 2.13]],
        DET: [['valdez', "Framber Valdez", 103, 4.05], ['flaherty', "Jack Flaherty", 92, 4.97], ['montero', "Keider Montero", 111, 3.39], ['mize', "Casey Mize", 116, 2.95], ['skubal', "Tarik Skubal", 112, 3.32]],
        HOU: [['burrows', "Mike Burrows", 86, 5.48], ['arrighetti', "Spencer Arrighetti", 104, 4], ['lambert', "Peter Lambert", 112, 3.28], ['imai', "Tatsuya Imai", 87, 5.36], ['brown', "Hunter Brown", 130, 1.78]],
        KC: [['wacha', "Michael Wacha", 112, 3.31], ['lugo', "Seth Lugo", 101, 4.18], ['cameron', "Noah Cameron", 98, 4.5], ['avila', "Luinder Avila", 87, 5.4], ['cruz', "Steven Cruz", 83, 5.68]],
        LAA: [['detmers', "Reid Detmers", 105, 3.88], ['soriano', "José Soriano", 112, 3.32], ['urena', "Walbert Ureña", 114, 3.14], ['aldegheri', "Sam Aldegheri", 93, 4.85], ['johnson', "Ryan Johnson", 78, 8.84]],
        LAD: [['yamamoto', "Yoshinobu Yamamoto", 120, 2.67], ['sheehan', "Emmet Sheehan", 91, 5.09], ['sasaki', "Roki Sasaki", 93, 4.88], ['wrobleski', "Justin Wrobleski", 119, 2.71], ['lauer', "Eric Lauer", 93, 4.87]],
        MIA: [['alcantara', "Sandy Alcantara", 103, 4.01], ['meyer', "Max Meyer", 120, 2.6], ['perez', "Eury Pérez", 99, 4.41], ['phillips', "Tyler Phillips", 115, 3.02], ['gusto', "Ryan Gusto", 91, 5.06]],
        MIL: [['misiorowski', "Jacob Misiorowski", 130, 1.45], ['harrison', "Kyle Harrison", 121, 2.57], ['sproat', "Brandon Sproat", 86, 5.43], ['woodruff', "Brandon Woodruff", 121, 2.59], ['patrick', "Chad Patrick", 105, 3.9]],
        MIN: [['ryan', "Joe Ryan", 113, 3.18], ['bradley', "Taj Bradley", 104, 3.98], ['prielipp', "Connor Prielipp", 92, 4.96], ['matthews', "Zebby Matthews", 97, 4.56], ['paredes', "Mike Paredes", 100, 4.26]],
        NYM: [['peralta', "Freddy Peralta", 97, 4.53], ['mclean', "Nolan McLean", 103, 4.03], ['scott', "Christian Scott", 113, 3.2], ['senga', "Kodai Senga", 78, 9.09], ['brazoban', "Huascar Brazobán", 128, 1.94]],
        NYY: [['schlittler', "Cam Schlittler", 130, 1.62], ['warren', "Will Warren", 107, 3.75], ['weathers', "Ryan Weathers", 104, 3.95], ['rodon', "Carlos Rodón", 107, 3.7], ['cole', "Gerrit Cole", 103, 4.06]],
        PHI: [['sanchez', "Cristopher Sánchez", 126, 2.13], ['luzardo', "Jesús Luzardo", 105, 3.88], ['nola', "Aaron Nola", 85, 5.58], ['wheeler', "Zack Wheeler", 127, 2.03], ['mayza', "Tim Mayza", 116, 2.95]],
        PIT: [['keller', "Mitch Keller", 93, 4.87], ['skenes', "Paul Skenes", 114, 3.1], ['ashcraft', "Braxton Ashcraft", 115, 3.07], ['chandler', "Bubba Chandler", 99, 4.42], ['mlodzinski', "Carmen Mlodzinski", 110, 3.47]],
        SD: [['king', "Michael King", 112, 3.32], ['buehler', "Walker Buehler", 106, 3.81], ['vasquez', "Randy Vásquez", 97, 4.56], ['canning', "Griffin Canning", 78, 7.38], ['peralta', "Wandy Peralta", 130, 1.77]],
        SEA: [['gilbert', "Logan Gilbert", 111, 3.42], ['kirby', "George Kirby", 104, 3.94], ['woo', "Bryan Woo", 100, 4.26], ['hancock', "Emerson Hancock", 110, 3.47], ['castillo', "Luis Castillo", 92, 4.93]],
        SF: [['ray', "Robbie Ray", 110, 3.5], ['roupp', "Landen Roupp", 103, 4.07], ['webb', "Logan Webb", 115, 3.09], ['houser', "Adrian Houser", 85, 5.53], ['mahle', "Tyler Mahle", 86, 5.49]],
        STL: [['pallante', "Andre Pallante", 106, 3.83], ['mcgreevy', "Michael McGreevy", 114, 3.12], ['leahy', "Kyle Leahy", 103, 4.09], ['liberatore', "Matthew Liberatore", 85, 5.56], ['may', "Dustin May", 100, 4.3]],
        TB: [['martinez', "Nick Martinez", 120, 2.66], ['rasmussen', "Drew Rasmussen", 122, 2.45], ['mcclanahan', "Shane McClanahan", 112, 3.3], ['jax', "Griffin Jax", 112, 3.33], ['seymour', "Ian Seymour", 100, 4.32]],
        TEX: [['gore', "MacKenzie Gore", 103, 4.05], ['eovaldi', "Nathan Eovaldi", 104, 3.95], ['degrom', "Jacob deGrom", 109, 3.55], ['rocker', "Kumar Rocker", 106, 3.83], ['quantrill', "Cal Quantrill", 112, 3.31]],
        TOR: [['gausman', "Kevin Gausman", 99, 4.36], ['cease', "Dylan Cease", 115, 3.02], ['corbin', "Patrick Corbin", 91, 5.09], ['yesavage', "Trey Yesavage", 109, 3.56], ['fisher', "Braydon Fisher", 110, 3.48]],
        WSH: [['griffin', "Foster Griffin", 116, 2.93], ['cavalli', "Cade Cavalli", 104, 4], ['littell', "Zack Littell", 88, 5.29], ['poulin', "PJ Poulin", 117, 2.88], ['mikolas', "Miles Mikolas", 89, 5.24]]
    };

    var HISTORICAL_PITCHERS = {
        'classic-1927-nyy': [['hoyt', 'Waite Hoyt', 116, 2.63], ['pennock', 'Herb Pennock', 112, 3.00], ['ruether', 'Dutch Ruether', 101, 3.38], ['pipgras', 'George Pipgras', 104, 4.11], ['shocker', 'Urban Shocker', 110, 2.84]],
        'classic-1939-nyy': [['ruffing', 'Red Ruffing', 118, 2.93], ['gomez', 'Lefty Gomez', 110, 3.41], ['russo', 'Marius Russo', 104, 2.41], ['hadley', 'Bump Hadley', 101, 4.26], ['donald', 'Atley Donald', 106, 3.71]],
        'classic-1955-bkn': [['newcombe', 'Don Newcombe', 116, 3.20], ['podres', 'Johnny Podres', 106, 3.95], ['craig', 'Roger Craig', 99, 4.10], ['loes', 'Billy Loes', 101, 3.50], ['labine', 'Clem Labine', 98, 3.24]],
        'classic-1961-nyy': [['ford', 'Whitey Ford', 121, 3.21], ['terry', 'Ralph Terry', 107, 3.15], ['stafford', 'Bill Stafford', 102, 2.68], ['daley', 'Bud Daley', 100, 3.96], ['sheldon', 'Rollie Sheldon', 99, 3.60]],
        'classic-1969-nym': [['seaver', 'Tom Seaver', 124, 2.21], ['koosman', 'Jerry Koosman', 114, 2.28], ['gentry', 'Gary Gentry', 106, 3.43], ['cardwell', 'Don Cardwell', 99, 3.01], ['mcandrew', 'Jim McAndrew', 97, 3.47]],
        'classic-1975-cin': [['nolan', 'Gary Nolan', 108, 3.16], ['gullett', 'Don Gullett', 106, 2.42], ['billingham', 'Jack Billingham', 99, 4.11], ['darcy', 'Pat Darcy', 95, 3.58], ['kirby', 'Clay Kirby', 94, 4.72]],
        'classic-1984-det': [['morris', 'Jack Morris', 113, 3.60], ['petry', 'Dan Petry', 107, 3.24], ['wilcox', 'Milt Wilcox', 101, 4.00], ['berenguer', 'Juan Berenguer', 96, 3.48], ['rozema', 'Dave Rozema', 94, 3.74]],
        'classic-1986-nym': [['gooden', 'Dwight Gooden', 121, 2.84], ['darling', 'Ron Darling', 109, 2.81], ['fernandez', 'Sid Fernandez', 108, 3.52], ['ojeda', 'Bob Ojeda', 110, 2.57], ['aguilera', 'Rick Aguilera', 99, 3.88]],
        'classic-1988-lad': [['hershiser', 'Orel Hershiser', 125, 2.26], ['leary', 'Tim Leary', 105, 2.91], ['belcher', 'Tim Belcher', 103, 2.91], ['welch', 'Bob Welch', 102, 3.64], ['hillegas', 'Shawn Hillegas', 96, 3.82]],
        'classic-1995-atl': [['maddux', 'Greg Maddux', 130, 1.63], ['glavine', 'Tom Glavine', 116, 3.08], ['smoltz', 'John Smoltz', 112, 3.18], ['avery', 'Steve Avery', 104, 4.67], ['mercker', 'Kent Mercker', 101, 4.15]],
        'classic-1998-nyy': [['cone', 'David Cone', 117, 3.55], ['pettitte', 'Andy Pettitte', 111, 4.24], ['wells', 'David Wells', 115, 3.49], ['hernandez', 'Orlando Hernandez', 108, 3.13], ['irabu', 'Hideki Irabu', 100, 4.06]],
        'classic-2001-sea': [['garcia', 'Freddy Garcia', 116, 3.05], ['moyer', 'Jamie Moyer', 109, 3.43], ['sele', 'Aaron Sele', 103, 3.60], ['abbott', 'Paul Abbott', 99, 4.25], ['halama', 'John Halama', 94, 4.73]],
        'classic-2004-bos': [['schilling', 'Curt Schilling', 122, 3.26], ['martinez', 'Pedro Martinez', 118, 3.90], ['wakefield', 'Tim Wakefield', 99, 4.87], ['lowe', 'Derek Lowe', 98, 5.42], ['arroyo', 'Bronson Arroyo', 101, 4.03]],
        'classic-2016-chc': [['arrieta', 'Jake Arrieta', 115, 3.10], ['hendricks', 'Kyle Hendricks', 120, 2.13], ['lester', 'Jon Lester', 116, 2.44], ['lackey', 'John Lackey', 103, 3.35], ['hammel', 'Jason Hammel', 100, 3.83]],
        'classic-2017-hou': [['keuchel', 'Dallas Keuchel', 114, 2.90], ['verlander', 'Justin Verlander', 118, 1.06], ['mccullers', 'Lance McCullers Jr.', 105, 4.25], ['peacock', 'Brad Peacock', 103, 3.00], ['morton', 'Charlie Morton', 106, 3.62]],
        'classic-2019-wsh': [['scherzer', 'Max Scherzer', 122, 2.92], ['strasburg', 'Stephen Strasburg', 118, 3.32], ['corbin', 'Patrick Corbin', 108, 3.25], ['sanchez', 'Anibal Sanchez', 101, 3.85], ['ross', 'Joe Ross', 94, 5.48]],
        'classic-2020-lad': [['kershaw', 'Clayton Kershaw', 118, 2.16], ['buehler', 'Walker Buehler', 113, 3.44], ['urias', 'Julio Urias', 107, 3.27], ['may', 'Dustin May', 104, 2.57], ['gonsolin', 'Tony Gonsolin', 106, 2.31]],
        'classic-2021-atl': [['fried', 'Max Fried', 115, 3.04], ['morton', 'Charlie Morton', 109, 3.34], ['anderson', 'Ian Anderson', 103, 3.58], ['smyly', 'Drew Smyly', 96, 4.48], ['ynoa', 'Huascar Ynoa', 98, 4.05]],
        'classic-2022-hou': [['verlander', 'Justin Verlander', 124, 1.75], ['valdez', 'Framber Valdez', 115, 2.82], ['javier', 'Cristian Javier', 111, 2.54], ['garcia', 'Luis Garcia', 104, 3.72], ['urquidy', 'Jose Urquidy', 101, 3.94]],
        'classic-2023-tex': [['eovaldi', 'Nathan Eovaldi', 111, 3.63], ['montgomery', 'Jordan Montgomery', 110, 2.79], ['gray', 'Jon Gray', 101, 4.12], ['heaney', 'Andrew Heaney', 98, 4.15], ['dunning', 'Dane Dunning', 102, 3.70]]
    };

    function makeCurrent(row) {
        return {
            id: row[0], era: 'current', name: row[1], abbreviation: row[2], league: row[3], division: row[4],
            offense: row[5], runPrevention: row[6], startingPitching: row[7], bullpen: row[8], volatility: row[9]
        };
    }

    function makeHistorical(row) {
        return {
            id: row[0], era: 'historical', name: row[1], abbreviation: row[2], season: row[3], league: 'Classic', division: 'Curated',
            offense: row[4], runPrevention: row[5], startingPitching: row[6], bullpen: row[7], volatility: row[8]
        };
    }

    var LOCAL_TEAMS = {
        current: CURRENT_TEAMS.map(makeCurrent),
        historical: HISTORICAL_TEAMS.map(makeHistorical)
    };

    var ESPN_TEAM_LOGO_SLUGS = {
        ARI: 'ari', ATL: 'atl', BAL: 'bal', BOS: 'bos', CHC: 'chc', CWS: 'chw', CIN: 'cin', CLE: 'cle', COL: 'col', DET: 'det',
        HOU: 'hou', KC: 'kc', LAA: 'laa', LAD: 'lad', MIA: 'mia', MIL: 'mil', MIN: 'min', NYM: 'nym', NYY: 'nyy', ATH: 'oak',
        PHI: 'phi', PIT: 'pit', SD: 'sd', SF: 'sf', SEA: 'sea', STL: 'stl', TB: 'tb', TEX: 'tex', TOR: 'tor', WSH: 'wsh'
    };

    var ESPN_ROSTER_SLUGS = {
        ARI: 'ari', ATL: 'atl', BAL: 'bal', BOS: 'bos', CHC: 'chc', CWS: 'chw', CIN: 'cin', CLE: 'cle', COL: 'col', DET: 'det',
        HOU: 'hou', KC: 'kc', LAA: 'laa', LAD: 'lad', MIA: 'mia', MIL: 'mil', MIN: 'min', NYM: 'nym', NYY: 'nyy', ATH: 'ath',
        PHI: 'phi', PIT: 'pit', SD: 'sd', SF: 'sf', SEA: 'sea', STL: 'stl', TB: 'tb', TEX: 'tex', TOR: 'tor', WSH: 'wsh'
    };

    var MLB_TEAM_IDS = {
        ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113, CLE: 114, COL: 115, DET: 116,
        HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133,
        PHI: 143, PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120
    };

    // Manual name blocklist for verified roster mismatches. MUST stay empty unless
    // a name is re-verified against the live MLB Stats API active roster first:
    // a stale entry here silently breaks the whole team (drops the real lineup to
    // the unordered roster fallback). June 4, 2026: removed { ARI: nolanarenado } —
    // statsapi 109/roster?rosterType=active lists Nolan Arenado | 3B | status A.
    var REPORTED_MISMATCHED_CURRENT_NAMES = {};
    var MIN_CURRENT_ROSTER_BATTERS = 9;
    var MIN_CURRENT_ROSTER_PITCHERS = 5;

    var TEAM_COLORS = {
        ARI: ['#a71930', '#e3d4ad'], ATL: ['#ce1141', '#13274f'], BAL: ['#df4601', '#000000'], BOS: ['#bd3039', '#0c2340'],
        CHC: ['#0e3386', '#cc3433'], CWS: ['#c4ced4', '#27251f'], CIN: ['#c6011f', '#ffffff'], CLE: ['#e31937', '#0c2340'],
        COL: ['#33006f', '#c4ced4'], DET: ['#0c2340', '#fa4616'], HOU: ['#eb6e1f', '#002d62'], KC: ['#004687', '#bd9b60'],
        LAA: ['#ba0021', '#003263'], LAD: ['#005a9c', '#ffffff'], MIA: ['#00a3e0', '#ef3340'], MIL: ['#ffc52f', '#12284b'],
        MIN: ['#002b5c', '#d31145'], NYM: ['#ff5910', '#002d72'], NYY: ['#0c2340', '#c4ced4'], ATH: ['#003831', '#efb21e'],
        PHI: ['#e81828', '#002d72'], PIT: ['#fdb827', '#27251f'], SD: ['#2f241d', '#ffc425'], SF: ['#fd5a1e', '#27251f'],
        SEA: ['#0c2c56', '#005c5c'], STL: ['#c41e3a', '#0c2340'], TB: ['#092c5c', '#8fbce6'], TEX: ['#003278', '#c0111f'],
        TOR: ['#134a8e', '#1d2d5c'], WSH: ['#ab0003', '#14225a'], BKN: ['#003087', '#ffffff']
    };
    var PARK_RUN_FACTORS = {
        COL: 1.13, BOS: 1.05, CIN: 1.05, TEX: 1.04, PHI: 1.03, BAL: 1.02, CHC: 1.02, NYY: 1.02,
        ARI: 1.01, ATL: 1.01, HOU: 1.00, KC: 1.00, LAA: 1.00, LAD: 1.00, MIN: 1.00, TOR: 1.00,
        MIL: 0.99, NYM: 0.99, STL: 0.99, WSH: 0.99, CWS: 0.98, DET: 0.98, MIA: 0.98, SD: 0.98,
        SEA: 0.97, SF: 0.97, TB: 0.97, ATH: 0.96, CLE: 0.96, PIT: 0.96
    };
    // Home-run-specific park factors (separate from overall run factor): some parks
    // (Coors, GABP, Yankee Stadium short porch) inflate HR while suppressing nothing,
    // others (Oracle, T-Mobile, Comerica) turn would-be homers into outs/doubles.
    var PARK_HR_FACTORS = {
        CIN: 1.18, COL: 1.16, NYY: 1.13, BAL: 1.10, CWS: 1.08, PHI: 1.07, MIL: 1.06, LAD: 1.05,
        TEX: 1.05, HOU: 1.04, TOR: 1.04, LAA: 1.04, ARI: 1.03, ATL: 1.02, CHC: 1.01, MIN: 1.00,
        WSH: 1.00, NYM: 0.98, STL: 0.96, TB: 0.96, CLE: 0.96, BOS: 0.94, DET: 0.93, SD: 0.93,
        MIA: 0.92, ATH: 0.92, KC: 0.92, SEA: 0.91, PIT: 0.91, SF: 0.86
    };
    function parkHrFactor(homeTeam) {
        return PARK_HR_FACTORS[homeTeam && homeTeam.abbreviation] || 1;
    }

    var LIVE_INPUT_SOURCES = [
        ['scheduleFinals', 'MLB schedule/finals', 'Unavailable', 'No verified current schedule or final score match is connected.'],
        ['teamRecords', 'Team records', 'Unavailable', 'No verified team record match is connected.'],
        ['startingPitchers', 'Probable starters', 'Unavailable', 'No probable starter feed is connected.'],
        ['confirmedStarters', 'Confirmed starter status', 'Unavailable', 'No confirmed-starter status feed is connected.'],
        ['ballpark', 'Ballpark', 'Unavailable', 'No verified venue feed is connected.'],
        ['weather', 'Weather', 'Unavailable', 'No verified weather feed is connected.'],
        ['sportsbookOdds', 'Sportsbook odds', 'Unavailable', 'No verified sportsbook source is connected.'],
        ['injuryReport', 'Injury report', 'Unavailable', 'No verified injury report feed is connected.'],
        ['rosterContext', 'Roster context', 'Unavailable', 'No verified player roster feed is connected.'],
        ['recentForm', 'Recent scoring form', 'Unavailable', 'No verified recent final-score feed is connected.'],
        ['bullpenContext', 'Bullpen context', 'Unavailable', 'No verified bullpen availability feed is connected.'],
        ['statcast', 'Statcast expected stats', 'Unavailable', 'No Baseball Savant expected-stats feed is connected.']
    ].map(function (row) { return { key: row[0], label: row[1], status: row[2], detail: row[3], verified: false }; });

    var state = {
        preset: 'current',
        awayPool: 'current',
        homePool: 'current',
        teams: LOCAL_TEAMS,
        dataMode: 'baseline',
        liveInputs: LIVE_INPUT_SOURCES,
        liveContext: {
            status: 'idle',
            loadedAt: null,
            scheduleGames: [],
            boardGames: [],
            espnEvents: [],
            espnSummaries: {},
            teamRosters: {},
            recentEvents: [],
            error: null
        },
        backendProjectionStatus: null,
        awayTeamId: LOCAL_TEAMS.current[0].id,
        homeTeamId: LOCAL_TEAMS.current[1].id,
        awayPitcherId: '',
        homePitcherId: '',
        awayPitcherTouched: false,
        homePitcherTouched: false,
        simulation: null,
        aggregate: null,
        simulationCount: 1
    };

    function byId(id) { return document.getElementById(id); }
    function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
    function round1(value) { return Math.round(value * 10) / 10; }
    function roundPct(value) { return (value * 100).toFixed(1).replace(/\.0$/, '') + '%'; }
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escapeAttr(value) { return escapeHtml(value); }
    function setText(id, value) { var el = byId(id); if (el) el.textContent = value; }
    // Accent-folding (June 4, 2026): names arrive both accented (active roster:
    // "Teoscar Hernández") and plain (lineup feeds) — without NFD folding the same
    // player failed to dedupe and appeared twice on the roster.
    function normalizeName(value) { return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, ''); }
    function seededHash(value) {
        var str = String(value || '');
        var h = 2166136261;
        for (var i = 0; i < str.length; i += 1) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    function seededRandom(seed) {
        var t = seed >>> 0;
        return function () {
            t += 0x6D2B79F5;
            var x = t;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }
    function poisson(lambda, random, maxLambda) {
        lambda = clamp(lambda, 0.02, Number.isFinite(maxLambda) ? maxLambda : 3.4);
        var limit = Math.exp(-lambda);
        var k = 0;
        var product = 1;
        do {
            k += 1;
            product *= random();
        } while (product > limit && k < 12);
        return k - 1;
    }
    function todayEspnDate() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
    function espnDateOffset(daysBack) {
        var d = new Date();
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().slice(0, 10).replace(/-/g, '');
    }
    function recentEspnDates() {
        var dates = [];
        for (var i = 0; i <= 6; i += 1) dates.push(espnDateOffset(i));
        return dates;
    }
    function apiBaseUrl() {
        if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.api && CONFIG.api.baseUrl) return CONFIG.api.baseUrl;
        return 'https://trustmyrecord-api.onrender.com/api';
    }
    function fetchJson(url, options) {
        if (typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
        options = options || {};
        // Hard timeout so a hung provider can never leave the tool loading forever;
        // callers already fall back to the LOCAL_TEAMS baseline on rejection.
        var timeoutMs = options.timeoutMs || 12000;
        var controller = (typeof AbortController === 'function') ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
        var fetchOpts = { headers: { 'Accept': 'application/json' }, cache: options.cache || 'default' };
        if (controller) fetchOpts.signal = controller.signal;
        return fetch(url, fetchOpts).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        }).catch(function (err) {
            if (err && err.name === 'AbortError') throw new Error('Request timed out after ' + timeoutMs + 'ms');
            throw err;
        }).then(function (v) { if (timer) clearTimeout(timer); return v; }, function (e) { if (timer) clearTimeout(timer); throw e; });
    }

    function isoDateUtc(d) { return d.toISOString().slice(0, 10); }
    function todayIsoLocal() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }
    function seasonYear() { return String(new Date().getUTCFullYear()); }
    // STATCAST_20260623: Baseball Savant expected-stats leaderboards (xwOBA, xERA).
    // Public CSV with access-control-allow-origin:* so the client can fetch directly.
    // Fetched once per session (whole-league leaderboard, not per-player), fail-open.
    function statcastUrl(type) {
        return 'https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=' + type + '&year=' + seasonYear() + '&position=&team=&filterType=bip&min=q&csv=true';
    }
    function parseCsvRow(line) {
        var out = [], cur = '', q = false;
        for (var i = 0; i < line.length; i++) {
            var c = line[i];
            if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
            else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
        }
        out.push(cur);
        return out;
    }
    function parseStatcastCsv(text) {
        var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (lines.length < 2) return {};
        var head = parseCsvRow(lines[0]).map(function (h) { return h.replace(/^﻿/, '').trim(); });
        var idx = {}; head.forEach(function (h, i) { idx[h] = i; });
        if (idx.player_id == null || idx.est_woba == null) return {};
        var map = {};
        for (var r = 1; r < lines.length; r++) {
            var f = parseCsvRow(lines[r]); var id = f[idx.player_id]; if (!id) continue;
            map[String(id)] = {
                woba: Number(f[idx.woba]), xwoba: Number(f[idx.est_woba]),
                era: idx.era != null ? Number(f[idx.era]) : null, xera: idx.xera != null ? Number(f[idx.xera]) : null
            };
        }
        return map;
    }
    function fetchStatcastExpected() {
        if (state.liveContext.statcast) return Promise.resolve(state.liveContext.statcast);
        function getText(url) { return fetch(url, { cache: 'default' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }); }
        return Promise.allSettled([getText(statcastUrl('batter')), getText(statcastUrl('pitcher'))]).then(function (res) {
            var batter = res[0].status === 'fulfilled' ? parseStatcastCsv(res[0].value) : {};
            var pitcher = res[1].status === 'fulfilled' ? parseStatcastCsv(res[1].value) : {};
            var sc = (Object.keys(batter).length || Object.keys(pitcher).length) ? { batter: batter, pitcher: pitcher, fetchedAt: Date.now() } : null;
            state.liveContext.statcast = sc;
            return sc;
        }).catch(function () { state.liveContext.statcast = null; return null; });
    }
    function cachedStatcast(id, type) {
        var sc = state.liveContext.statcast;
        return sc && sc[type] && sc[type][String(id)] || null;
    }
    // DEFENSE_OAA_20260624: Baseball Savant team Outs Above Average (fielding). CORS-open
    // CSV; whole-league (30 rows) so fetched once/session. OAA is league-centered (sums
    // to ~0) so feeding it as an opponent-run adjustment is calibration-neutral.
    function teamOaaUrl() {
        return 'https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Fielding_Team&startYear=' + seasonYear() + '&endYear=' + seasonYear() + '&split=no&team=&range=year&min=q&pos=&roles=&viz=hide&csv=true';
    }
    function parseTeamOaaCsv(text) {
        var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (lines.length < 2) return {};
        var head = parseCsvRow(lines[0]).map(function (h) { return h.replace(/^﻿/, '').trim(); });
        var idx = {}; head.forEach(function (h, i) { idx[h] = i; });
        if (idx.team_id == null || idx.outs_above_average == null) return {};
        var map = {};
        for (var r = 1; r < lines.length; r++) {
            var f = parseCsvRow(lines[r]); var id = f[idx.team_id]; if (!id) continue;
            map[String(id)] = Number(f[idx.outs_above_average]);
        }
        return map;
    }
    function fetchTeamOaa() {
        if (state.liveContext.teamOaa) return Promise.resolve(state.liveContext.teamOaa);
        return fetch(teamOaaUrl(), { cache: 'default' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(function (text) { var m = parseTeamOaaCsv(text); state.liveContext.teamOaa = Object.keys(m).length ? m : null; return state.liveContext.teamOaa; })
            .catch(function () { state.liveContext.teamOaa = null; return null; });
    }
    function teamOaaFor(team) {
        var m = state.liveContext.teamOaa;
        var id = team && MLB_TEAM_IDS[team.abbreviation];
        return m && id != null && Number.isFinite(m[String(id)]) ? m[String(id)] : null;
    }
    // A team's season OAA converted to a per-game opponent-run adjustment (good defense
    // -> negative -> suppresses opponent runs). ~0.75 run/out over ~75 team-games to date.
    function defenseRunAdjustment(fieldingTeam) {
        var oaa = teamOaaFor(fieldingTeam);
        if (!Number.isFinite(oaa)) return 0;
        return clamp(-oaa * 0.012, -0.30, 0.30);
    }
    function todaysScheduleUrl() {
        return 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + encodeURIComponent(todayIsoLocal()) +
            '&hydrate=' + encodeURIComponent('probablePitcher,lineups,team,weather,venue') + '&_=' + encodeURIComponent(UI_BUILD);
    }
    var TODAY_SCHEDULE_TTL_MS = 120000;
    function fetchTodaysSchedule() {
        var cached = state.liveContext.todaySchedule;
        // Short TTL, not a permanent session cache: MLB posts today's lineups during
        // the day, so the schedule must be re-pulled periodically so a pre-game
        // fallback can upgrade to today's confirmed/posted lineup once it appears.
        if (cached && cached.uiBuild === UI_BUILD && (Date.now() - (cached.fetchedAt || 0)) < TODAY_SCHEDULE_TTL_MS) return Promise.resolve(cached);
        return fetchJson(todaysScheduleUrl(), { cache: 'no-store' }).then(function (data) {
            var games = (Array.isArray(data && data.dates) ? data.dates : []).reduce(function (all, day) {
                return all.concat(Array.isArray(day && day.games) ? day.games : []);
            }, []);
            state.liveContext.todaySchedule = { uiBuild: UI_BUILD, fetchedAt: Date.now(), games: games };
            return state.liveContext.todaySchedule;
        }).catch(function () {
            // Keep any previously fetched games on a transient failure; just stamp the
            // time so the next call retries after the TTL instead of wiping to empty.
            state.liveContext.todaySchedule = { uiBuild: UI_BUILD, fetchedAt: Date.now(), games: (cached && cached.games) || [] };
            return state.liveContext.todaySchedule;
        });
    }
    function todaysGameForTeam(games, team) {
        var expectedId = team && MLB_TEAM_IDS[team.abbreviation];
        if (!expectedId || !Array.isArray(games)) return null;
        for (var i = 0; i < games.length; i += 1) {
            var g = games[i];
            var awayId = g && g.teams && g.teams.away && g.teams.away.team && g.teams.away.team.id;
            var homeId = g && g.teams && g.teams.home && g.teams.home.team && g.teams.home.team.id;
            if (String(awayId) === String(expectedId)) return { game: g, side: 'away' };
            if (String(homeId) === String(expectedId)) return { game: g, side: 'home' };
        }
        return null;
    }
    function todaysLineupForTeam(games, team) {
        var found = todaysGameForTeam(games, team);
        if (!found) return null;
        var key = found.side === 'home' ? 'homePlayers' : 'awayPlayers';
        var raw = found.game.lineups && Array.isArray(found.game.lineups[key]) ? found.game.lineups[key] : [];
        if (raw.length < 9) return null;
        var expectedId = MLB_TEAM_IDS[team.abbreviation];
        var players = raw.slice(0, 9).map(function (p, idx) {
            var name = p.fullName || ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
            var position = p.primaryPosition && (p.primaryPosition.abbreviation || p.primaryPosition.name) || '';
            return {
                name: name,
                position: position,
                battingOrder: (idx + 1) * 100,
                teamId: String(expectedId || ''),
                mlbId: p.id || null
            };
        });
        var gameState = found.game.status && (found.game.status.abstractGameState || found.game.status.detailedState) || '';
        var isLiveOrFinal = /live|final|in progress/i.test(gameState);
        return {
            teamId: String(expectedId || ''),
            players: players,
            confirmed: isLiveOrFinal,
            lineupStatus: isLiveOrFinal ? 'confirmed' : 'posted',
            source: isLiveOrFinal ? "Today's confirmed MLB lineup" : "Today's posted MLB lineup (pregame)",
            gamePk: found.game.gamePk || null,
            sourceGamePk: found.game.gamePk || null,
            sourceGameDate: todayIsoLocal(),
            fetchedAt: Date.now(),
            substitutesRejected: []
        };
    }
    function todaysProbableStarterForTeam(games, team) {
        var found = todaysGameForTeam(games, team);
        if (!found) return null;
        var pp = found.game.teams && found.game.teams[found.side] && found.game.teams[found.side].probablePitcher;
        if (!pp || !pp.id) return null;
        return { id: pp.id, name: pp.fullName || ((pp.firstName || '') + ' ' + (pp.lastName || '')).trim(), side: found.side };
    }
    function todaysWeatherForTeam(games, team) {
        var found = todaysGameForTeam(games, team);
        if (!found) return null;
        var w = found.game.weather;
        if (!w || (!w.temp && !w.condition && !w.wind)) return null;
        var temp = Number(String(w.temp || '').replace(/[^\d.\-]/g, ''));
        var gust = null;
        var windStr = String(w.wind || '');
        var gustMatch = windStr.match(/(\d+)\s*mph/i);
        if (gustMatch) gust = Number(gustMatch[1]);
        return {
            temperature: Number.isFinite(temp) ? temp : null,
            display: w.condition || '',
            wind: w.wind || '',
            gust: Number.isFinite(gust) ? gust : null,
            precipitation: /rain|shower|storm/i.test(String(w.condition || '')) ? 1 : 0,
            source: 'MLB schedule weather'
        };
    }
    function todaysVenueForTeam(games, team) {
        var found = todaysGameForTeam(games, team);
        if (!found) return null;
        var v = found.game.venue;
        if (!v || !v.name) return null;
        return { id: v.id || null, name: v.name, source: 'MLB schedule venue' };
    }
    function todaysRecordForTeam(games, team) {
        var found = todaysGameForTeam(games, team);
        if (!found) return null;
        var side = found.side;
        var rec = found.game.teams && found.game.teams[side] && found.game.teams[side].leagueRecord;
        if (!rec || !Number.isFinite(Number(rec.wins))) return null;
        var wins = Number(rec.wins || 0);
        var losses = Number(rec.losses || 0);
        var total = wins + losses;
        return {
            wins: wins,
            losses: losses,
            pct: total ? wins / total : 0,
            summary: wins + '-' + losses,
            source: 'MLB schedule team record'
        };
    }
    function teamLiveOpsFactor(team, opposingHand) {
        if (!team || team.era !== 'current') return null;
        var roster = state.liveContext.teamRosters && state.liveContext.teamRosters[team.abbreviation];
        if (!roster || !Array.isArray(roster.players)) return null;
        var topHitters = roster.players.slice(0, 9).filter(function (p) { return p && p.mlbId; });
        if (topHitters.length < 6) return null;
        var splitCount = 0;
        var stats = topHitters.map(function (p) {
            var split = opposingHand ? cachedPlayerSplitVs(p.mlbId, 'hitting', opposingHand) : null;
            var base = null;
            if (split && Number(split.ops) > 0 && Number(split.plateAppearances) >= 25) { splitCount += 1; base = split; }
            if (!base) { var season = cachedPlayerStat(p.mlbId, 'hitting'); if (season && Number(season.ops) > 0 && Number(season.plateAppearances) >= 30) base = season; }
            return base ? { ops: Number(base.ops), mlbId: p.mlbId } : null;
        }).filter(Boolean);
        if (stats.length < 6) return null;
        // STATCAST_PROJECTION_20260624 (Phase 6c): regress each hitter's OPS toward his
        // Statcast expected production via the xwOBA/wOBA luck ratio (0.55 results /
        // 0.45 expected, mirroring the pitcher xERA blend). Population-centered so it
        // shifts matchups toward true talent without moving league-average offense.
        var statcastAdj = 0;
        var adjOps = stats.map(function (s) {
            var sc = cachedStatcast(s.mlbId, 'batter');
            if (sc && Number.isFinite(sc.woba) && sc.woba > 0 && Number.isFinite(sc.xwoba)) {
                statcastAdj += 1;
                var luck = clamp(sc.xwoba / sc.woba, 0.90, 1.10);
                return s.ops * (0.55 + 0.45 * luck);
            }
            return s.ops;
        });
        var meanOps = adjOps.reduce(function (sum, v) { return sum + v; }, 0) / adjOps.length;
        return {
            meanOps: meanOps,
            sampleSize: stats.length,
            splitCount: splitCount,
            statcastAdj: statcastAdj,
            vsHand: opposingHand || null,
            factor: clamp(1 + (meanOps - 0.720) * 0.55, 0.85, 1.15)
        };
    }
    // TEAM_TRUE_TALENT_20260629: real season run differential is the single best
    // calibrated team-quality signal. Fetch the league standings once (RS/RA/GP for all
    // 30), then blend each matchup's log5 Pythagorean expectation into the win % as a
    // true-talent prior. One call, cached league-wide, so any matchup can read it.
    function fetchLeagueSeasonStrength() {
        if (state.liveContext.teamSeasonLoaded) return Promise.resolve(state.liveContext.teamSeason || null);
        var url = 'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=' + seasonYear() + '&standingsTypes=regularSeason&_=' + encodeURIComponent(UI_BUILD);
        return fetchJson(url, { cache: 'default' }).then(function (data) {
            var id2abbr = {}; Object.keys(MLB_TEAM_IDS).forEach(function (a) { id2abbr[MLB_TEAM_IDS[a]] = a; });
            var map = {};
            (data && data.records || []).forEach(function (rec) {
                (rec.teamRecords || []).forEach(function (t) {
                    var ab = id2abbr[t.team && t.team.id]; if (!ab) return;
                    var rs = Number(t.runsScored), ra = Number(t.runsAllowed), gp = Number(t.gamesPlayed);
                    if (rs > 0 && ra > 0 && gp >= 10) map[ab] = { rs: rs, ra: ra, gp: gp };
                });
            });
            state.liveContext.teamSeason = map; state.liveContext.teamSeasonLoaded = true;
            return map;
        }).catch(function () { state.liveContext.teamSeasonLoaded = true; return null; });
    }
    function teamSeasonPythag(team) {
        if (!team || team.era !== 'current') return null;
        var s = state.liveContext.teamSeason && state.liveContext.teamSeason[team.abbreviation];
        if (!s) return null;
        var ex = 1.83, rs = Math.pow(s.rs, ex), ra = Math.pow(s.ra, ex);
        return (rs + ra) > 0 ? rs / (rs + ra) : null;
    }
    // REAL_RSRA_BLEND_20260630 helpers.
    // League average runs/team/game across whatever teams are loaded (>=10 teams needed).
    function leagueRunBaseline() {
        var ts = state.liveContext.teamSeason; if (!ts) return null;
        var s = 0, c = 0;
        Object.keys(ts).forEach(function (k) { var x = ts[k]; if (x && x.gp > 0) { s += x.rs / x.gp; c++; } });
        return c >= 10 ? s / c : null;
    }
    // Matchup-runs (Bill James): offense team's real RS/g x defense team's real RA/g /
    // league RS/g. Uses pre-game season-to-date RS/RA (current standings live; injected
    // as-of-game-date in backtest) so there is no look-ahead in this term.
    function teamRealRunExp(off, def) {
        if (!off || off.era !== 'current' || !def || def.era !== 'current') return null;
        var ts = state.liveContext.teamSeason; if (!ts) return null;
        var o = ts[off.abbreviation], d = ts[def.abbreviation], lg = leagueRunBaseline();
        if (!o || !d || !lg || o.gp < 10 || d.gp < 10) return null;
        return clamp((o.rs / o.gp) * (d.ra / d.gp) / lg, 1.6, 9.4);
    }
    function playerStatsUrl(playerId, group) {
        return 'https://statsapi.mlb.com/api/v1/people/' + encodeURIComponent(playerId) +
            '/stats?stats=season&group=' + encodeURIComponent(group) +
            '&season=' + encodeURIComponent(seasonYear()) +
            '&_=' + encodeURIComponent(UI_BUILD);
    }
    function fetchPlayerSeasonStats(playerId, group) {
        if (!playerId) return Promise.resolve(null);
        state.liveContext.playerStats = state.liveContext.playerStats || {};
        var cacheKey = playerId + ':' + group;
        if (Object.prototype.hasOwnProperty.call(state.liveContext.playerStats, cacheKey)) {
            return Promise.resolve(state.liveContext.playerStats[cacheKey]);
        }
        return fetchJson(playerStatsUrl(playerId, group), { cache: 'default' }).then(function (data) {
            var split = data && data.stats && data.stats[0] && data.stats[0].splits && data.stats[0].splits[0];
            var stat = split && split.stat || null;
            state.liveContext.playerStats = state.liveContext.playerStats || {};
            state.liveContext.playerStats[cacheKey] = stat;
            return stat;
        }).catch(function () {
            state.liveContext.playerStats = state.liveContext.playerStats || {};
            state.liveContext.playerStats[cacheKey] = null;
            return null;
        });
    }
    function cachedPlayerStat(playerId, group) {
        var key = playerId + ':' + group;
        return state.liveContext.playerStats && state.liveContext.playerStats[key] || null;
    }
    function playerProfileUrl(playerId) {
        return 'https://statsapi.mlb.com/api/v1/people/' + encodeURIComponent(playerId) + '?_=' + encodeURIComponent(UI_BUILD);
    }
    function fetchPlayerProfile(playerId) {
        if (!playerId) return Promise.resolve(null);
        state.liveContext.playerProfiles = state.liveContext.playerProfiles || {};
        if (Object.prototype.hasOwnProperty.call(state.liveContext.playerProfiles, playerId)) {
            return Promise.resolve(state.liveContext.playerProfiles[playerId]);
        }
        return fetchJson(playerProfileUrl(playerId), { cache: 'default' }).then(function (data) {
            var p = data && data.people && data.people[0] || null;
            state.liveContext.playerProfiles = state.liveContext.playerProfiles || {};
            state.liveContext.playerProfiles[playerId] = p;
            return p;
        }).catch(function () {
            state.liveContext.playerProfiles = state.liveContext.playerProfiles || {};
            state.liveContext.playerProfiles[playerId] = null;
            return null;
        });
    }
    function cachedPlayerProfile(playerId) {
        return state.liveContext.playerProfiles && state.liveContext.playerProfiles[playerId] || null;
    }
    function pitchHandOf(playerId) {
        var p = cachedPlayerProfile(playerId);
        return p && p.pitchHand && p.pitchHand.code || null;
    }
    function batSideOf(playerId) {
        var p = cachedPlayerProfile(playerId);
        return p && p.batSide && p.batSide.code || null;
    }
    function playerSplitsUrl(playerId, group) {
        return 'https://statsapi.mlb.com/api/v1/people/' + encodeURIComponent(playerId) +
            '/stats?stats=statSplits&group=' + encodeURIComponent(group) +
            '&sitCodes=vl,vr&season=' + encodeURIComponent(seasonYear()) +
            '&_=' + encodeURIComponent(UI_BUILD);
    }
    function fetchPlayerSplits(playerId, group) {
        if (!playerId) return Promise.resolve(null);
        state.liveContext.playerSplits = state.liveContext.playerSplits || {};
        var key = playerId + ':' + group;
        if (Object.prototype.hasOwnProperty.call(state.liveContext.playerSplits, key)) {
            return Promise.resolve(state.liveContext.playerSplits[key]);
        }
        return fetchJson(playerSplitsUrl(playerId, group), { cache: 'default' }).then(function (data) {
            var splits = data && data.stats && data.stats[0] && Array.isArray(data.stats[0].splits) ? data.stats[0].splits : [];
            var byCode = {};
            splits.forEach(function (s) {
                var code = s && s.split && s.split.code;
                if (code) byCode[code] = s.stat || null;
            });
            state.liveContext.playerSplits = state.liveContext.playerSplits || {};
            state.liveContext.playerSplits[key] = byCode;
            return byCode;
        }).catch(function () {
            state.liveContext.playerSplits = state.liveContext.playerSplits || {};
            state.liveContext.playerSplits[key] = null;
            return null;
        });
    }
    function cachedPlayerSplitVs(playerId, group, vsHand) {
        var key = playerId + ':' + group;
        var byCode = state.liveContext.playerSplits && state.liveContext.playerSplits[key] || null;
        if (!byCode) return null;
        if (vsHand === 'L') return byCode.vl || null;
        if (vsHand === 'R') return byCode.vr || null;
        return null;
    }
    function injuredRosterUrl(team) {
        var teamId = team && MLB_TEAM_IDS[team.abbreviation];
        return teamId ? 'https://statsapi.mlb.com/api/v1/teams/' + teamId + '/roster?rosterType=fullRoster&_=' + encodeURIComponent(UI_BUILD) : '';
    }
    function fetchInjuredRoster(team) {
        if (!team || team.era !== 'current') return Promise.resolve(null);
        state.liveContext.teamInjured = state.liveContext.teamInjured || {};
        if (Object.prototype.hasOwnProperty.call(state.liveContext.teamInjured, team.abbreviation)) {
            return Promise.resolve(state.liveContext.teamInjured[team.abbreviation]);
        }
        var url = injuredRosterUrl(team);
        if (!url) return Promise.resolve(null);
        return fetchJson(url, { cache: 'default' }).then(function (data) {
            var list = (Array.isArray(data && data.roster) ? data.roster : []).filter(function (p) {
                var desc = p && p.status && p.status.description || '';
                return /^Injured\b/i.test(desc);
            }).map(function (p) {
                return {
                    name: p.person && p.person.fullName || '',
                    position: p.position && (p.position.abbreviation || p.position.name) || '',
                    status: p.status && p.status.description || ''
                };
            });
            state.liveContext.teamInjured[team.abbreviation] = list;
            return list;
        }).catch(function () {
            state.liveContext.teamInjured[team.abbreviation] = null;
            return null;
        });
    }
    // LINEUP_INTEGRITY_20260722: same-day transaction detection. Any move made
    // today (option, recall, IL placement, trade, release, DFA) invalidates a
    // cached lineup, so the signature of today's transactions is part of the
    // roster cache key.
    var TRANSACTIONS_TTL_MS = 300000;
    // How many recent completed games to walk back through looking for a usable
    // starting lineup before giving up and using the active-roster fallback.
    var MAX_LINEUP_LOOKBACK_GAMES = 5;
    function fetchTodaysTransactions(team) {
        var teamId = team && MLB_TEAM_IDS[team.abbreviation];
        if (!teamId) return Promise.resolve([]);
        state.liveContext.teamTransactions = state.liveContext.teamTransactions || {};
        var cached = state.liveContext.teamTransactions[team.abbreviation];
        if (cached && (Date.now() - cached.fetchedAt) < TRANSACTIONS_TTL_MS) return Promise.resolve(cached.list);
        var day = todayIsoLocal();
        var url = 'https://statsapi.mlb.com/api/v1/transactions?teamId=' + teamId + '&startDate=' + day + '&endDate=' + day;
        return fetchJson(url, { cache: 'no-store' }).then(function (data) {
            var list = (Array.isArray(data && data.transactions) ? data.transactions : []).map(function (t) {
                return {
                    id: t.id || null,
                    type: t.typeDesc || t.typeCode || '',
                    player: t.person && t.person.fullName || '',
                    playerId: t.person && t.person.id || null,
                    description: t.description || ''
                };
            });
            state.liveContext.teamTransactions[team.abbreviation] = { fetchedAt: Date.now(), list: list };
            return list;
        }).catch(function () {
            state.liveContext.teamTransactions[team.abbreviation] = { fetchedAt: Date.now(), list: (cached && cached.list) || [] };
            return (cached && cached.list) || [];
        });
    }
    function transactionSignature(team) {
        var cached = state.liveContext.teamTransactions && state.liveContext.teamTransactions[team && team.abbreviation];
        if (!cached || !cached.list) return '';
        return cached.list.map(function (t) { return t.id || (t.type + ':' + t.playerId); }).sort().join(',');
    }
    function pitcherQualityFromEra(era) {
        var n = Number(era);
        if (!Number.isFinite(n)) return 100;
        return Math.round(clamp(100 + (4.30 - n) * 12, 78, 130));
    }

    function playerPositionLabel(player) {
        return String(player && player.position || '').toUpperCase();
    }
    function rosterSortValue(player) {
        var position = playerPositionLabel(player);
        var order = { CF: 1, SS: 2, RF: 3, '1B': 4, '3B': 5, LF: 6, DH: 7, '2B': 8, C: 9, OF: 10, IF: 11 };
        return order[position] || 20;
    }
    function playerBlockedForTeam(team, name) {
        var blocked = team && REPORTED_MISMATCHED_CURRENT_NAMES[team.abbreviation];
        return !!(blocked && blocked[normalizeName(name)]);
    }
    function playerBelongsToTeam(player, team) {
        if (!team || team.era !== 'current' || !player) return !!player;
        var expectedId = MLB_TEAM_IDS[team.abbreviation];
        if (!expectedId) return false;
        if (playerBlockedForTeam(team, player.name)) return false;
        return String(player.teamId || '') === String(expectedId);
    }
    function validatedRosterForTeam(team, roster) {
        if (!roster || !Array.isArray(roster.players)) return null;
        if (team && team.era === 'current' && String(roster.teamId || '') !== String(MLB_TEAM_IDS[team.abbreviation] || '')) return null;
        var players = roster.players.filter(function (player) { return playerBelongsToTeam(player, team); });
        if (!players.length) return null;
        var pitchers = players.filter(function (player) { return /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || '')); });
        var hitters = players.filter(function (player) { return !/^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || '')); });
        if (team && team.era === 'current' && (hitters.length < MIN_CURRENT_ROSTER_BATTERS || pitchers.length < MIN_CURRENT_ROSTER_PITCHERS)) return null;
        return Object.assign({}, roster, {
            count: players.length,
            relievers: pitchers.length,
            players: players,
            summary: players.length + ' verified active roster players'
        });
    }
    function collectEspnTeamRoster(data, team) {
        var players = [];
        var groups = Array.isArray(data && data.athletes) ? data.athletes : [];
        groups.forEach(function (group) {
            var groupPosition = group && (group.position || group.displayName || group.name) || '';
            (group.items || group.athletes || []).forEach(function (item) {
                var name = item && (item.displayName || item.fullName || item.name);
                if (!name) return;
                var position = item.position && (item.position.abbreviation || item.position.displayName || item.position.name) || groupPosition;
                players.push({ name: name, position: position, teamId: String(MLB_TEAM_IDS[team && team.abbreviation] || '') });
            });
        });
        var seen = {};
        players = players.filter(function (player) {
            var key = normalizeName(player.name);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
        var hitters = players.filter(function (player) { return !/Pitcher|P$|SP|RP|CP/i.test(player.position); }).sort(function (a, b) { return rosterSortValue(a) - rosterSortValue(b); });
        var pitchers = players.filter(function (player) { return /Pitcher|P$|SP|RP|CP/i.test(player.position); });
        return validatedRosterForTeam(team, {
            teamId: String(MLB_TEAM_IDS[team && team.abbreviation] || ''),
            count: players.length,
            relievers: pitchers.length,
            players: hitters.concat(pitchers),
            summary: players.length + ' ESPN roster players',
            source: 'ESPN roster endpoint'
        });
    }
    function collectMlbTeamRoster(data, team, recentLineup) {
        var expectedId = MLB_TEAM_IDS[team && team.abbreviation];
        var players = [];
        (Array.isArray(data && data.roster) ? data.roster : []).forEach(function (entry) {
            var name = entry && entry.person && entry.person.fullName;
            var position = entry && entry.position && (entry.position.abbreviation || entry.position.name);
            var teamId = entry && (entry.parentTeamId || entry.teamId || expectedId);
            var statusCode = entry && entry.status && entry.status.code;
            var personId = entry && entry.person && entry.person.id;
            if (!name || !position) return;
            if (statusCode && statusCode !== 'A') return;
            players.push({ name: name, position: position, teamId: String(teamId || ''), mlbId: personId || null });
        });
        var seen = {};
        players = players.filter(function (player) {
            var key = normalizeName(player.name);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
        var hitters = players.filter(function (player) { return !/Pitcher|P$|SP|RP|CP/i.test(player.position); }).sort(function (a, b) { return rosterSortValue(a) - rosterSortValue(b); });
        var pitchers = players.filter(function (player) { return /Pitcher|P$|SP|RP|CP/i.test(player.position); });
        var orderedHitters = [];
        var lineupRemovals = [];
        var lineupBackfills = [];
        if (recentLineup && Array.isArray(recentLineup.players) && recentLineup.players.length >= 9) {
            var activeByName = {};
            var activeById = {};
            players.forEach(function (player) {
                activeByName[normalizeName(player.name)] = player;
                if (player.mlbId) activeById[String(player.mlbId)] = player;
            });
            var injuredList = (state.liveContext.teamInjured && state.liveContext.teamInjured[team && team.abbreviation]) || [];
            var injuredByName = {};
            injuredList.forEach(function (p) { if (p && p.name) injuredByName[normalizeName(p.name)] = p.status || 'injured list'; });
            // LINEUP_INTEGRITY_20260722 - hierarchy step 3. An official lineup posted
            // for TODAY is authoritative and is trusted as-is. A carried-forward
            // "recent" lineup is only a projection, so every slot must still be a
            // player who is on the team's active roster RIGHT NOW: anyone optioned,
            // designated, traded, released or placed on the IL since that game gets
            // dropped here (matched by MLB player id first, name only as a fallback).
            var officialToday = recentLineup.lineupStatus === 'confirmed' || recentLineup.lineupStatus === 'posted';
            var usedKeys = {};
            orderedHitters = recentLineup.players.slice(0, 9).map(function (player, index) {
                var active = (player.mlbId && activeById[String(player.mlbId)]) || activeByName[normalizeName(player.name)] || null;
                var slot = index + 1;
                if (playerBlockedForTeam(team, player.name)) {
                    lineupRemovals.push({ slot: slot, name: player.name, reason: 'blocked (reported roster mismatch)' });
                    return null;
                }
                if (!officialToday) {
                    if (!active) {
                        lineupRemovals.push({ slot: slot, name: player.name, reason: 'no longer on the active roster (optioned, traded, released or IL)' });
                        return null;
                    }
                    if (injuredByName[normalizeName(player.name)]) {
                        lineupRemovals.push({ slot: slot, name: player.name, reason: injuredByName[normalizeName(player.name)] });
                        return null;
                    }
                }
                var key = String(player.mlbId || normalizeName(player.name));
                if (usedKeys[key]) {
                    lineupRemovals.push({ slot: slot, name: player.name, reason: 'duplicate lineup entry' });
                    return null;
                }
                usedKeys[key] = true;
                var position = player.position || (active && active.position) || '';
                if (!isDefensivePosition(position)) position = (active && isDefensivePosition(active.position)) ? active.position : 'DH';
                return Object.assign({}, active || {}, {
                    name: player.name,
                    position: position,
                    teamId: String(expectedId || ''),
                    battingOrder: slot * 100,
                    mlbId: player.mlbId || (active && active.mlbId) || null
                });
            });
            // Hierarchy step 4: refill emptied slots ONLY from the current active
            // roster, best available position first, never duplicating a player.
            if (lineupRemovals.length) {
                var bench = hitters.filter(function (p) {
                    return !usedKeys[String(p.mlbId || normalizeName(p.name))] && !injuredByName[normalizeName(p.name)];
                });
                // Track which defensive spots the surviving starters already cover so a
                // backfill does not field a second catcher / second shortstop. A bench
                // player whose spot is taken is still eligible - he just slots in at DH.
                var filledPositions = {};
                orderedHitters.forEach(function (p) {
                    if (p && isDefensivePosition(p.position) && p.position !== 'DH') filledPositions[String(p.position).toUpperCase()] = true;
                });
                orderedHitters = orderedHitters.map(function (player, index) {
                    if (player) return player;
                    // Prefer a bench bat who covers a position nobody else is playing.
                    var pickIndex = -1;
                    for (var b = 0; b < bench.length; b += 1) {
                        var pos = String(bench[b].position || '').toUpperCase();
                        if (isDefensivePosition(pos) && pos !== 'DH' && !filledPositions[pos]) { pickIndex = b; break; }
                    }
                    if (pickIndex === -1) pickIndex = 0;
                    var pick = bench.splice(pickIndex, 1)[0];
                    if (!pick) return null;
                    usedKeys[String(pick.mlbId || normalizeName(pick.name))] = true;
                    var pos2 = String(pick.position || '').toUpperCase();
                    var assigned = (isDefensivePosition(pos2) && pos2 !== 'DH' && !filledPositions[pos2]) ? pos2 : 'DH';
                    if (assigned !== 'DH') filledPositions[assigned] = true;
                    lineupBackfills.push({ slot: index + 1, name: pick.name, position: assigned });
                    return Object.assign({}, pick, {
                        teamId: String(expectedId || ''),
                        battingOrder: (index + 1) * 100,
                        position: assigned
                    });
                });
            }
            // Hierarchy step 5: only a complete, de-duplicated 9 counts as a lineup.
            orderedHitters = orderedHitters.filter(Boolean);
            if (orderedHitters.length < 9) orderedHitters = [];
        }
        // Only claim a lineup-backed order when we actually applied 9 ordered hitters.
        // Otherwise fall back honestly to the active-roster (no set batting order).
        var appliedLineup = orderedHitters.length >= 9;
        if (appliedLineup) {
            var used = {};
            orderedHitters.forEach(function (player) { used[normalizeName(player.name)] = true; });
            hitters = orderedHitters.concat(hitters.filter(function (player) { return !used[normalizeName(player.name)]; }));
        }
        var lineupStatus = appliedLineup ? (recentLineup.lineupStatus || (recentLineup.confirmed ? 'confirmed' : 'recent')) : 'roster';
        var lineupConfirmed = lineupStatus === 'confirmed';
        var LINEUP_LABELS = {
            confirmed: {
                source: "Today's confirmed MLB lineup (live/final game) plus verified MLB active roster endpoint",
                lineupSource: "Today's confirmed MLB lineup",
                badge: 'Confirmed lineup (MLB, today)'
            },
            posted: {
                source: "Today's posted MLB starting lineup (pregame, not yet final) plus verified MLB active roster endpoint",
                lineupSource: "Today's posted MLB starting lineup (pregame)",
                badge: 'Posted lineup (today, pregame)'
            },
            recent: {
                source: 'Projected from most recent game starting lineup plus verified MLB active roster endpoint',
                lineupSource: 'Projected from most recent game starting lineup',
                badge: 'Projected from last game'
            },
            roster: {
                source: 'Active roster fallback (no set batting order) from verified MLB active roster endpoint',
                lineupSource: null,
                badge: 'Active roster fallback (not a set batting order)'
            }
        };
        var labels = LINEUP_LABELS[lineupStatus] || LINEUP_LABELS.roster;
        // Final cross-list dedupe (June 4, 2026): a two-way player (e.g. Ohtani,
        // position TWP, which the pitcher regex matches via /P$/) can land in BOTH
        // the ordered lineup and the pitcher list — keep the first (lineup) entry.
        var mergedSeen = {};
        var mergedPlayers = hitters.concat(pitchers).filter(function (player) {
            var key = normalizeName(player.name);
            if (mergedSeen[key]) return false;
            mergedSeen[key] = true;
            return true;
        });
        return validatedRosterForTeam(team, {
            teamId: String(expectedId || ''),
            count: mergedPlayers.length,
            relievers: pitchers.length,
            players: mergedPlayers,
            summary: players.length + ' MLB active roster players',
            source: labels.source,
            lineupSource: labels.lineupSource,
            lineupStatus: lineupStatus,
            lineupBadge: labels.badge,
            lineupConfirmed: lineupConfirmed,
            // LINEUP_INTEGRITY_20260722 - hierarchy step 6: freshness + provenance.
            rosterFeed: 'MLB Stats API /teams/' + expectedId + '/roster?rosterType=active',
            rosterFetchedAt: Date.now(),
            lineupFeed: lineupStatus === 'confirmed' || lineupStatus === 'posted'
                ? 'MLB Stats API /schedule?hydrate=lineups (today)'
                : (lineupStatus === 'recent' ? 'MLB Stats API game feed/live boxscore starters (battingOrder N00)' : 'none - active roster order'),
            lineupFetchedAt: (recentLineup && recentLineup.fetchedAt) || Date.now(),
            lineupSourceGamePk: (recentLineup && recentLineup.sourceGamePk) || (recentLineup && recentLineup.gamePk) || null,
            lineupSourceGameDate: (recentLineup && recentLineup.sourceGameDate) || null,
            lineupRemovals: lineupRemovals,
            lineupBackfills: lineupBackfills,
            substitutesRejected: (recentLineup && recentLineup.substitutesRejected) || [],
            injuredCount: ((state.liveContext.teamInjured && state.liveContext.teamInjured[team && team.abbreviation]) || []).length
        });
    }
    function mlbDateString(date) {
        return date.toISOString().slice(0, 10);
    }
    function recentLineupUrl(team) {
        var teamId = team && MLB_TEAM_IDS[team.abbreviation];
        if (!teamId) return '';
        var end = new Date();
        var start = new Date();
        start.setDate(start.getDate() - 21);
        return 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=' + teamId + '&startDate=' + mlbDateString(start) + '&endDate=' + mlbDateString(end) + '&gameType=R&_=' + encodeURIComponent(UI_BUILD);
    }
    function teamSideInGame(game, team) {
        // Handles BOTH statsapi shapes: schedule games (teams.home.team.id) and
        // live-feed gameData (teams.home.id). The old schedule-only read returned
        // '' for live feeds, which silently killed the recent-game batting order
        // and dropped every non-posted team to the unordered roster fallback.
        var teamId = String(MLB_TEAM_IDS[team && team.abbreviation] || '');
        function sideId(s) {
            var t = game && game.teams && game.teams[s];
            if (!t) return '';
            if (t.team && t.team.id != null) return String(t.team.id);
            if (t.id != null) return String(t.id);
            return '';
        }
        if (sideId('home') === teamId) return 'home';
        if (sideId('away') === teamId) return 'away';
        return '';
    }
    function latestFinalGames(data, team) {
        var games = [];
        (Array.isArray(data && data.dates) ? data.dates : []).forEach(function (date) {
            (Array.isArray(date && date.games) ? date.games : []).forEach(function (game) {
                if (teamSideInGame(game, team) && game.status && game.status.abstractGameState === 'Final') games.push(game);
            });
        });
        games.sort(function (a, b) { return new Date(b.gameDate || b.officialDate || 0).getTime() - new Date(a.gameDate || a.officialDate || 0).getTime(); });
        return games;
    }
    function latestFinalGame(data, team) {
        return latestFinalGames(data, team)[0] || null;
    }
    // LINEUP_INTEGRITY_20260722: a batting-order slot's position can be a
    // non-defensive in-game role (PH pinch hitter, PR pinch runner). Never let
    // those reach the lineup as a fielding assignment - fall back to the
    // player's own primary position, then DH.
    var DEFENSIVE_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
    var NON_DEFENSIVE_ROLE = /^(PH|PR|SUB)$/i;
    function isDefensivePosition(pos) {
        return DEFENSIVE_POSITIONS.indexOf(String(pos || '').toUpperCase()) !== -1;
    }
    function playerFromBoxscore(boxTeam, feed, id) {
        var key = 'ID' + id;
        var row = boxTeam && boxTeam.players && boxTeam.players[key] || null;
        var gamePlayer = feed && feed.gameData && feed.gameData.players && feed.gameData.players[key] || null;
        var person = row && row.person || gamePlayer || {};
        var primary = person.primaryPosition || (gamePlayer && gamePlayer.primaryPosition) || {};
        var position = row && row.position || primary || {};
        var abbr = position.abbreviation || position.name || '';
        if (!abbr || NON_DEFENSIVE_ROLE.test(abbr)) abbr = primary.abbreviation || primary.name || abbr;
        return {
            name: person.fullName || person.nameFirstLast || person.boxscoreName || '',
            position: abbr,
            teamId: ''
        };
    }
    // LINEUP_INTEGRITY_20260722 (ROOT CAUSE FIX): boxscore.teams[side].battingOrder
    // is the END-OF-GAME occupant of each slot, NOT the player who started there.
    // Every pinch hitter / pinch runner / defensive replacement overwrites the real
    // starter, which is why bench players and PR/PH roles were showing up in
    // projected lineups (verified 2026-07-22: 21/30 teams, 34 bad slots, e.g.
    // SF slot 6 "Grant McCray (PR)" instead of Jung Hoo Lee).
    // The authoritative starter for slot N is the player whose OWN battingOrder
    // field is exactly N*100 (substitutes get N01, N02, ...).
    function startersBySlotFromBoxscore(boxTeam) {
        var bySlot = {};
        var players = boxTeam && boxTeam.players || {};
        Object.keys(players).forEach(function (key) {
            var p = players[key];
            var bo = Number(p && p.battingOrder || 0);
            if (!bo || bo % 100 !== 0) return;
            var slot = bo / 100;
            if (slot < 1 || slot > 9) return;
            if (bySlot[slot] == null) bySlot[slot] = p.person && p.person.id || null;
        });
        return bySlot;
    }
    function collectRecentStartingLineup(feed, team, gameMeta) {
        var side = teamSideInGame(feed && feed.gameData, team);
        var boxTeam = side && feed && feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams && feed.liveData.boxscore.teams[side];
        if (!boxTeam) return null;
        var order = Array.isArray(boxTeam.battingOrder) ? boxTeam.battingOrder : [];
        var starters = startersBySlotFromBoxscore(boxTeam);
        var teamId = String(MLB_TEAM_IDS[team && team.abbreviation] || '');
        var usedIds = {};
        var players = [];
        var substitutesRejected = [];
        for (var slot = 1; slot <= 9; slot += 1) {
            // Prefer the true starter; only fall back to the end-of-game occupant
            // when this game's feed has no %100 batting-order entry for the slot.
            var id = starters[slot] != null ? starters[slot] : order[slot - 1];
            if (!id || usedIds[String(id)]) continue;
            var endOfGameId = order[slot - 1];
            if (starters[slot] != null && endOfGameId && String(endOfGameId) !== String(starters[slot])) {
                var subbed = playerFromBoxscore(boxTeam, feed, endOfGameId);
                if (subbed.name) substitutesRejected.push({ slot: slot, name: subbed.name });
            }
            var player = playerFromBoxscore(boxTeam, feed, id);
            if (!player.name) continue;
            player.teamId = teamId;
            player.battingOrder = slot * 100;
            player.mlbId = id || null;
            if (!playerBelongsToTeam(player, team)) continue;
            usedIds[String(id)] = true;
            players.push(player);
        }
        if (players.length < 9) return null;
        return {
            players: players,
            source: 'Most recent game starting lineup (projected)',
            confirmed: false,
            lineupStatus: 'recent',
            sourceGamePk: gameMeta && gameMeta.gamePk || null,
            sourceGameDate: gameMeta && gameMeta.officialDate || null,
            fetchedAt: Date.now(),
            substitutesRejected: substitutesRejected
        };
    }
    function fetchRecentStartingLineup(team) {
        return fetchTodaysSchedule().then(function (sched) {
            var todays = todaysLineupForTeam(sched.games, team);
            if (todays && Array.isArray(todays.players) && todays.players.length >= 9) return todays;
            var url = recentLineupUrl(team);
            if (!url) return null;
            // LINEUP_INTEGRITY_20260722 - hierarchy step 2: the most recent VALID
            // starting lineup. The schedule feed sometimes reports a game that has
            // NOT been played yet as abstractGameState 'Final' (its live feed is
            // still 'Preview' with an empty boxscore). Taking only the single
            // newest "Final" game therefore silently produced NO lineup at all and
            // dropped the team to the unordered active-roster fallback (observed
            // 2026-07-22 for BAL, BOS, NYY, PIT). So walk back through recent
            // finals and keep the first one that actually yields nine starters.
            return fetchJson(url, { cache: 'no-store' }).then(function (schedule) {
                var games = latestFinalGames(schedule, team).filter(function (g) { return g && g.link; }).slice(0, MAX_LINEUP_LOOKBACK_GAMES);
                if (!games.length) return null;
                function tryGame(index) {
                    if (index >= games.length) return Promise.resolve(null);
                    var game = games[index];
                    var feedUrl = /^https?:\/\//.test(game.link) ? game.link : 'https://statsapi.mlb.com' + game.link;
                    return fetchJson(feedUrl, { cache: 'no-store' }).then(function (feed) {
                        var lineup = collectRecentStartingLineup(feed, team, game);
                        return lineup || tryGame(index + 1);
                    }).catch(function () { return tryGame(index + 1); });
                }
                return tryGame(0);
            });
        }).catch(function () {
            return null;
        });
    }
    function teamRosterUrl(team) {
        var teamId = team && MLB_TEAM_IDS[team.abbreviation];
        return teamId ? 'https://statsapi.mlb.com/api/v1/teams/' + teamId + '/roster?rosterType=active&_=' + encodeURIComponent(UI_BUILD) : '';
    }
    function rosterSourceForTeam(team) {
        return {
            teamId: team && MLB_TEAM_IDS[team.abbreviation] || null,
            url: teamRosterUrl(team),
            lineupUrl: recentLineupUrl(team),
            source: 'MLB Stats API active roster',
            cache: 'no-store plus UI build cache-buster',
            minimumBatters: MIN_CURRENT_ROSTER_BATTERS,
            minimumPitchers: MIN_CURRENT_ROSTER_PITCHERS
        };
    }
    function prefetchPlayerStatsForRoster(roster) {
        // Returns a promise that settles when every stat fetch lands, so
        // callers can re-render with REAL season numbers instead of leaving
        // baseline profile values on screen (REAL_ERA_LABELS_20260606).
        if (!roster) return Promise.resolve(null);
        var jobs = [];
        if (roster.todayProbableStarter && roster.todayProbableStarter.id) {
            jobs.push(fetchPlayerSeasonStats(roster.todayProbableStarter.id, 'pitching'));
            jobs.push(fetchPlayerProfile(roster.todayProbableStarter.id));
        }
        var players = Array.isArray(roster.players) ? roster.players : [];
        players.slice(0, 9).forEach(function (p) {
            if (p && p.mlbId) {
                jobs.push(fetchPlayerSeasonStats(p.mlbId, 'hitting'));
                jobs.push(fetchPlayerSplits(p.mlbId, 'hitting'));
            }
        });
        var pitchers = players.filter(function (p) {
            return p && p.mlbId && /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(p.position || ''));
        }).slice(0, 14);
        pitchers.forEach(function (p) {
            jobs.push(fetchPlayerSeasonStats(p.mlbId, 'pitching'));
            // RELIEVER_HAND_20260623: load each bullpen arm's profile so pitchHandOf()
            // returns a real throw hand (previously only the probable starter's profile
            // was fetched, leaving reliever handedness null/undisplayed).
            jobs.push(fetchPlayerProfile(p.mlbId));
        });
        return Promise.all(jobs);
    }
    function refreshPitcherSelectsFromState() {
        try {
            var awayTeam = findTeamInPool(state.awayTeamId, state.awayPool);
            var homeTeam = findTeamInPool(state.homeTeamId, state.homePool);
            if (awayTeam) renderPitcherOptions('away', awayTeam, state.activeLiveContext);
            if (homeTeam) renderPitcherOptions('home', homeTeam, state.activeLiveContext);
        } catch (e) { /* render best-effort; stale labels are non-fatal */ }
    }
    function teamLiveBullpenFactor(team) {
        if (!team || team.era !== 'current') return null;
        var roster = state.liveContext.teamRosters && state.liveContext.teamRosters[team.abbreviation];
        if (!roster || !Array.isArray(roster.players)) return null;
        var pitchers = roster.players.filter(function (p) {
            return p && p.mlbId && /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(p.position || ''));
        });
        var relievers = pitchers.map(function (p) {
            var s = cachedPlayerStat(p.mlbId, 'pitching');
            if (!s) return null;
            var gs = Number(s.gamesStarted || 0);
            var g = Number(s.gamesPlayed || 0);
            var era = Number(s.era);
            if (!Number.isFinite(era) || era <= 0 || era >= 30) return null;
            var ip = Number(String(s.inningsPitched || '0').replace('.', '.'));
            if (!Number.isFinite(ip) || ip < 5) return null;
            if (gs >= 4 || (g && gs / g >= 0.5)) return null;
            var so = Number(s.strikeOuts || 0);
            var bb = Number(s.baseOnBalls || 0);
            var hr = Number(s.homeRuns || 0);
            return {
                name: p.name,
                era: era,
                ip: ip,
                k9: ip > 0 ? (so / ip) * 9 : null,
                bb9: ip > 0 ? (bb / ip) * 9 : null,
                hr9: ip > 0 ? (hr / ip) * 9 : null
            };
        }).filter(Boolean);
        if (relievers.length < 4) return null;
        var ipTotal = relievers.reduce(function (sum, r) { return sum + r.ip; }, 0);
        if (ipTotal <= 0) return null;
        function ipWeightedMean(field) {
            var sum = 0;
            var weight = 0;
            relievers.forEach(function (r) {
                if (Number.isFinite(r[field])) {
                    sum += r[field] * r.ip;
                    weight += r.ip;
                }
            });
            return weight > 0 ? sum / weight : null;
        }
        var meanEra = ipWeightedMean('era');
        var meanK9 = ipWeightedMean('k9');
        var meanBb9 = ipWeightedMean('bb9');
        var meanHr9 = ipWeightedMean('hr9');
        return {
            meanEra: meanEra,
            meanK9: meanK9,
            meanBb9: meanBb9,
            meanHr9: meanHr9,
            sampleSize: relievers.length,
            adjustment: clamp((4.10 - meanEra) * 0.12, -0.35, 0.35)
        };
    }
    function fetchTeamRoster(team) {
        if (!team || team.era !== 'current') return Promise.resolve(null);
        state.liveContext.teamRosters = state.liveContext.teamRosters || {};
        var cachedRoster = state.liveContext.teamRosters[team.abbreviation];
        // A today posted/confirmed lineup is final for the session (the verified-good
        // path — keep caching it unchanged). A pre-game FALLBACK ("recent" last-game
        // order or active-roster) is only cached briefly, so once MLB posts today's
        // lineup a later Run picks it up instead of showing the old lineup forever.
        // LINEUP_INTEGRITY_20260722: a cached lineup is also dropped when today's
        // transaction list changes (a call-up/option/IL move/trade made mid-day),
        // and a confirmed lineup is no longer cached forever - it re-validates
        // against the active roster at least every TRANSACTIONS_TTL_MS.
        if (cachedRoster && cachedRoster.uiBuild === UI_BUILD && cachedRoster.txnSignature === transactionSignature(team)) {
            var isTodayLineup = cachedRoster.lineupStatus === 'confirmed' || cachedRoster.lineupStatus === 'posted';
            var age = Date.now() - (cachedRoster.fetchedAt || 0);
            if (age < (isTodayLineup ? TRANSACTIONS_TTL_MS : TODAY_SCHEDULE_TTL_MS)) return Promise.resolve(cachedRoster);
        }
        var url = teamRosterUrl(team);
        if (!url) return Promise.resolve(null);
        // LINEUP_INTEGRITY_20260722: the injured list and today's transactions must
        // land BEFORE the lineup is assembled - they are inputs to the validation
        // stage, not after-the-fact decoration (they used to be fired afterwards,
        // so the first build of every lineup ran with an empty IL).
        return Promise.all([
            fetchJson(url, { cache: 'no-store' }),
            fetchInjuredRoster(team).then(function () { return fetchRecentStartingLineup(team); }),
            fetchTodaysSchedule(),
            fetchTodaysTransactions(team)
        ]).then(function (results) {
            var roster = collectMlbTeamRoster(results[0], team, results[1]);
            var probable = results[2] ? todaysProbableStarterForTeam(results[2].games, team) : null;
            if (roster) {
                roster.uiBuild = UI_BUILD;
                roster.fetchedAt = Date.now();
                roster.todayProbableStarter = probable || null;
                roster.todayTransactions = results[3] || [];
                roster.txnSignature = transactionSignature(team);
            }
            state.liveContext.teamRosters[team.abbreviation] = roster;
            // Wait for the real season stats so the simulation and the pitcher
            // dropdowns use verified numbers, then upgrade any labels already
            // rendered with baseline profiles (REAL_ERA_LABELS_20260606).
            return prefetchPlayerStatsForRoster(roster).catch(function () { return null; }).then(function () {
                refreshPitcherSelectsFromState();
                return roster;
            });
        }).catch(function () {
            state.liveContext.teamRosters[team.abbreviation] = null;
            return null;
        });
    }
    function rostersForTeams(away, home, context) {
        var rosters = {};
        if (context && context.extraContext && context.extraContext.rosters) {
            if (away && away.era !== 'current') rosters.away = context.extraContext.rosters.away;
            if (home && home.era !== 'current') rosters.home = context.extraContext.rosters.home;
        }
        rosters.away = validatedRosterForTeam(away, rosters.away);
        rosters.home = validatedRosterForTeam(home, rosters.home);
        state.liveContext.teamRosters = state.liveContext.teamRosters || {};
        if (!rosters.away && away && away.era === 'current') rosters.away = validatedRosterForTeam(away, state.liveContext.teamRosters[away.abbreviation]);
        if (!rosters.home && home && home.era === 'current') rosters.home = validatedRosterForTeam(home, state.liveContext.teamRosters[home.abbreviation]);
        return rosters.away || rosters.home ? rosters : null;
    }
    function ensureRostersForTeams(away, home) {
        return Promise.all([fetchTeamRoster(away), fetchTeamRoster(home)]);
    }

    function poolTeams(pool) { return state.teams[pool] || []; }
    function activeTeams() { return poolTeams(state.awayPool).concat(poolTeams(state.homePool)); }
    function findTeamInPool(id, pool) { return poolTeams(pool).filter(function (team) { return team.id === id; })[0] || null; }
    function findTeam(id) {
        return poolTeams('current').concat(poolTeams('historical')).filter(function (team) { return team.id === id; })[0] || null;
    }
    function eraLabel(team) {
        if (!team) return 'Select team';
        return team.era === 'historical' ? 'Classic ' + team.season : 'Current MLB';
    }
    function teamMeta(team) {
        if (!team) return 'No team selected';
        if (team.era === 'historical') return [team.abbreviation, team.season, 'Historical'].join(' / ');
        var base = [team.abbreviation, team.league, team.division].join(' / ');
        var roster = state.liveContext && state.liveContext.teamRosters && state.liveContext.teamRosters[team.abbreviation];
        if (roster && roster.lineupConfirmed) return base + " - Today's confirmed lineup";
        if (roster && roster.lineupSource) return base + ' - ' + roster.lineupSource;
        return base;
    }
    function teamColors(team) {
        return team && TEAM_COLORS[team.abbreviation] || ['#2dd4bf', '#60a5fa'];
    }
    function teamLogoUrl(team) {
        if (!team || team.era !== 'current' || !ESPN_TEAM_LOGO_SLUGS[team.abbreviation]) return '';
        return 'https://a.espncdn.com/i/teamlogos/mlb/500/' + ESPN_TEAM_LOGO_SLUGS[team.abbreviation] + '.png';
    }
    function logoMarkup(team, sizeClass) {
        var abbreviation = team ? team.abbreviation : 'MLB';
        var colors = teamColors(team);
        var url = teamLogoUrl(team);
        var fallbackStyle = 'background: linear-gradient(135deg, ' + colors[0] + ', ' + colors[1] + ');';
        var fallback = '<span class="team-logo-fallback" style="' + escapeAttr(fallbackStyle) + '">' + escapeHtml(abbreviation) + '</span>';
        if (!url) return '<span class="team-logo-mark ' + sizeClass + '">' + fallback + '</span>';
        return "<span class=\"team-logo-mark " + sizeClass + "\"><img src=\"" + escapeAttr(url) + "\" alt=\"" + escapeAttr((team ? team.name : 'MLB') + " logo") + "\" loading=\"lazy\" onerror=\"this.style.display='none';this.nextElementSibling.style.display='grid';\"><span class=\"team-logo-fallback image-fallback\" style=\"" + escapeAttr(fallbackStyle) + "\">" + escapeHtml(abbreviation) + "</span></span>";
    }
    function renderTeamIdentity(id, team, label) {
        var el = byId(id);
        if (!el) return;
        if (!team) {
            el.innerHTML = '<div class="team-logo-mark picker-logo"><span class="team-logo-fallback">MLB</span></div><div><strong>' + escapeHtml(label || 'Select team') + '</strong><span>Choose a team to load starters</span></div>';
            return;
        }
        el.innerHTML = logoMarkup(team, 'picker-logo') + '<div><strong>' + escapeHtml(team.name) + '</strong><span>' + escapeHtml(teamMeta(team)) + '</span></div>';
    }
    function setLogo(id, team, sizeClass) {
        var el = byId(id);
        if (el) el.innerHTML = logoMarkup(team, sizeClass || 'small-logo');
    }
    function applyAccent(id, team) {
        var el = byId(id);
        if (!el || !team) return;
        var colors = teamColors(team);
        el.style.setProperty('--team-primary', colors[0]);
        el.style.setProperty('--team-secondary', colors[1]);
    }
    function pitcherId(side, slug) { return side + '-pitcher-' + slug; }
    function slugify(value) { return normalizeName(value).slice(0, 40) || 'starter'; }
    function currentPitchersForTeam(team, side, context) {
        var liveStarter = context && context.espnGame ? (side === 'away' ? context.espnGame.awayStarter : context.espnGame.homeStarter) : null;
        var options = [];
        var addedNames = {};
        function addOption(opt) {
            var key = normalizeName(opt.name);
            if (!key || addedNames[key]) return;
            addedNames[key] = true;
            options.push(opt);
        }
        var verifiedRoster = validatedRosterForTeam(team, state.liveContext.teamRosters && state.liveContext.teamRosters[team.abbreviation]);
        var verifiedPitchers = verifiedRoster ? verifiedRoster.players.filter(function (player) {
            return /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || ''));
        }) : [];
        var curatedPitchers = CURRENT_PITCHERS[team.abbreviation] || [];
        function curatedMatch(name) {
            return curatedPitchers.filter(function (row) { return normalizeName(row[1]) === normalizeName(name); })[0] || null;
        }
        var todayProbable = state.liveContext.teamRosters && state.liveContext.teamRosters[team.abbreviation] && state.liveContext.teamRosters[team.abbreviation].todayProbableStarter;
        if (todayProbable && todayProbable.name) {
            var pitchStat = cachedPlayerStat(todayProbable.id, 'pitching');
            var realEra = pitchStat ? Number(pitchStat.era) : null;
            var todayRates = pitcherRealRates(Number.isFinite(realEra) ? pitchStat : null);
            addOption({
                id: pitcherId(side, 'today-' + slugify(todayProbable.name)),
                name: todayProbable.name,
                quality: pitcherQualityFromEra(realEra),
                era: Number.isFinite(realEra) ? realEra : null,
                whip: todayRates.whip,
                kbbPct: todayRates.kbbPct,
                source: "Today's confirmed MLB probable starter",
                verified: true,
                confirmed: true,
                mlbId: todayProbable.id || null,
                note: pitchStat
                    ? ('Real ' + seasonYear() + ' season' + (Number.isFinite(realEra) ? ' ERA ' + realEra.toFixed(2) : '') + (pitchStat.whip ? ', WHIP ' + pitchStat.whip : '') + ', ' + (pitchStat.wins || 0) + '-' + (pitchStat.losses || 0))
                    : "Today's confirmed MLB probable starter from the official schedule"
            });
        }
        if (liveStarter && liveStarter.name && verifiedPitchers.filter(function (player) { return normalizeName(player.name) === normalizeName(liveStarter.name); }).length) {
            addOption({
                id: pitcherId(side, 'live-' + slugify(liveStarter.name)),
                name: liveStarter.name,
                quality: 104 + clamp((4.2 - (Number.isFinite(liveStarter.era) ? liveStarter.era : 4.2)) * 8, -12, 16),
                era: Number.isFinite(liveStarter.era) ? liveStarter.era : null,
                source: 'Verified ESPN probable starter',
                verified: true,
                note: liveStarter.record || 'Listed by ESPN as probable'
            });
        }
        var rosterRows = verifiedPitchers.filter(function (player) {
            return !addedNames[normalizeName(player.name)];
        }).sort(function (a, b) {
            var aCurated = curatedMatch(a.name);
            var bCurated = curatedMatch(b.name);
            if (aCurated && bCurated) return curatedPitchers.indexOf(aCurated) - curatedPitchers.indexOf(bCurated);
            if (aCurated) return -1;
            if (bCurated) return 1;
            return 0;
        });
        if (!rosterRows.length && !options.length && curatedPitchers.length) {
            try { console.warn('[mlb-simulator] EMERGENCY FALLBACK: live active-roster feed unavailable for ' + (team && team.abbreviation) + '; showing static emergency pitcher profiles (regenerated 2026-06-28, may be outdated).'); } catch (e) {}
            state.usedEmergencyPitcherFallback = state.usedEmergencyPitcherFallback || {};
            if (team) state.usedEmergencyPitcherFallback[team.abbreviation] = true;
            return curatedPitchers.map(function (row) {
                return {
                    id: pitcherId(side, team.id + '-' + row[0]),
                    name: row[1],
                    quality: row[2],
                    era: row[3],
                    eraVerified: false,
                    source: 'Emergency fallback profile (live roster unavailable)',
                    verified: false,
                    emergencyFallback: true,
                    note: 'EMERGENCY fallback: the live MLB active-roster feed did not load, so this is a static profile (regenerated 2026-06-28) and may be outdated. Not confirmed current.'
                };
            });
        }
        if (!rosterRows.length && !options.length) return [];
        // FULL_ROTATION_DROPDOWN_20260629: include every pitcher who has actually started
        // a game this season (not a hard top-3/5 cap), so any real probable starter is
        // selectable. Falls back to the top roster arms when season stats have not loaded.
        var starterRows = rosterRows.filter(function (player) {
            var st = player.mlbId ? cachedPlayerStat(player.mlbId, 'pitching') : null;
            return st && Number(st.gamesStarted || 0) >= 1;
        });
        var minShow = options.length >= 2 ? 3 : (options.length === 1 ? 4 : 5);
        var rowsToShow = (starterRows.length >= minShow ? starterRows : rosterRows).slice(0, 10);
        rowsToShow.forEach(function (player) {
            var row = curatedMatch(player.name);
            var stat = player.mlbId ? cachedPlayerStat(player.mlbId, 'pitching') : null;
            var realEra = stat ? Number(stat.era) : null;
            var hasReal = Number.isFinite(realEra);
            var rosterRates = pitcherRealRates(hasReal ? stat : null);
            addOption({
                id: pitcherId(side, team.id + '-' + slugify(player.name)),
                name: player.name,
                quality: hasReal ? pitcherQualityFromEra(realEra) : (row ? row[2] : 100),
                era: hasReal ? realEra : (row ? row[3] : null),
                whip: rosterRates.whip,
                kbbPct: rosterRates.kbbPct,
                eraVerified: hasReal,
                source: hasReal ? (verifiedRoster.source + ' plus real ' + seasonYear() + ' season pitching stats') : verifiedRoster.source,
                verified: true,
                mlbId: player.mlbId || null,
                note: hasReal
                    ? ('Real ' + seasonYear() + ' season ERA ' + realEra.toFixed(2) + (stat.whip ? ', WHIP ' + stat.whip : '') + ', ' + (stat.wins || 0) + '-' + (stat.losses || 0))
                    : 'Verified on the selected team active roster'
            });
        });
        return options;
    }
    function historicalPitchersForTeam(team, side) {
        var rows = HISTORICAL_PITCHERS[team.id] || [];
        rows = rows.slice();
        return rows.map(function (row) {
            return {
                id: pitcherId(side, team.id + '-' + row[0]),
                name: row[1],
                quality: row[2],
                era: row[3],
                source: 'Historical simulator input',
                verified: false,
                note: 'Curated historical simulator input; not live verified starter data'
            };
        });
    }
    function pitcherOptionsFor(team, side, context) {
        if (!team) return [];
        return team.era === 'historical' ? historicalPitchersForTeam(team, side) : currentPitchersForTeam(team, side, context);
    }
    function selectedPitcher(side, team, context) {
        var options = pitcherOptionsFor(team, side, context);
        var selectedId = side === 'away' ? state.awayPitcherId : state.homePitcherId;
        return options.filter(function (pitcher) { return pitcher.id === selectedId; })[0] || options[0] || null;
    }
    function pitcherMeta(pitcher) {
        if (!pitcher) return 'No pitcher selected.';
        if (pitcher.confirmed) return "Today's confirmed MLB probable starter. Real " + seasonYear() + ' season ERA shown.';
        if (pitcher.verified) return 'Verified on the selected team active roster.';
        return 'Starter list is for simulation selection and may not reflect today\'s confirmed starter.';
    }
    function pitcherRecord(pitcher) {
        var match = String(pitcher && pitcher.note ? pitcher.note : '').match(/(\d+\s*-\s*\d+)/);
        return match ? match[1].replace(/\s+/g, '') : null;
    }
    // PITCHER_RATES_20260622: derive real WHIP + K-BB% from cached statsapi
    // season pitching splits. Returns nulls when stats are absent so labels
    // never render baseline/placeholder rates as if they were real.
    function pitcherRealRates(stat) {
        if (!stat) return { whip: null, kbbPct: null };
        var whip = Number(stat.whip);
        var bf = Number(stat.battersFaced || 0);
        var so = Number(stat.strikeOuts || 0);
        var bb = Number(stat.baseOnBalls || 0);
        return {
            whip: Number.isFinite(whip) && whip > 0 ? whip : null,
            kbbPct: bf > 0 ? (so - bb) / bf : null
        };
    }
    function pitcherOptionLabel(pitcher) {
        // Only show stats we actually have; never render placeholder values.
        // Baseline profile ERAs (eraVerified === false on current teams) are
        // model inputs, not real season stats -- never display them as "ERA"
        // (REAL_ERA_LABELS_20260606). Historical/classic curated ERAs keep
        // displaying (real recorded history).
        var parts = [pitcher.name];
        if (pitcher.era != null && pitcher.eraVerified !== false) parts.push('ERA ' + pitcher.era);
        if (pitcher.whip != null) parts.push('WHIP ' + pitcher.whip.toFixed(2));
        if (pitcher.kbbPct != null) parts.push('K-BB% ' + (pitcher.kbbPct * 100).toFixed(1) + '%');
        var record = pitcherRecord(pitcher);
        if (record) parts.push('W-L ' + record);
        return parts.join(', ');
    }
    function pitcherOptionTag(pitcher, selected) {
        return '<option value="' + escapeHtml(pitcher.id) + '"' + (selected ? ' selected' : '') + '>' + escapeHtml(pitcherOptionLabel(pitcher)) + '</option>';
    }
    function strength(team) {
        return (team.offense * 0.38) + (team.runPrevention * 0.25) + (team.startingPitching * 0.22) + (team.bullpen * 0.15);
    }
    function edgeLabel(metric, away, home) {
        var gap = away[metric] - home[metric];
        if (Math.abs(gap) < 2.5) return 'Near even';
        return (gap > 0 ? away.name : home.name) + ' +' + Math.abs(Math.round(gap));
    }
    function parkRunFactor(homeTeam) {
        return PARK_RUN_FACTORS[homeTeam && homeTeam.abbreviation] || 1;
    }
    function weatherRunAdjustment(weather) {
        if (!weather) return 0;
        var adjustment = 0;
        if (Number.isFinite(weather.temperature)) {
            if (weather.temperature >= 85) adjustment += 0.12;
            else if (weather.temperature >= 78) adjustment += 0.06;
            else if (weather.temperature <= 48) adjustment -= 0.09;
        }
        // WIND_DIRECTION_20260629: wind blowing OUT carries fly balls (more runs/HR), IN
        // knocks them down. Parse the MLB schedule wind string ("12 mph, Out To CF").
        if (typeof weather.wind === 'string') {
            var wmph = (weather.wind.match(/(\d+)\s*mph/i) || [])[1];
            wmph = wmph ? Number(wmph) : 0;
            if (/\bout\b/i.test(weather.wind)) adjustment += clamp(wmph * 0.006, 0, 0.12);
            else if (/\bin\b/i.test(weather.wind)) adjustment -= clamp(wmph * 0.005, 0, 0.10);
        } else if (Number.isFinite(weather.gust) && weather.gust >= 18) adjustment += 0.04;
        if (Number.isFinite(weather.precipitation) && weather.precipitation > 0) adjustment -= 0.08;
        return clamp(adjustment, -0.22, 0.24);
    }
    function applyMarketTotalCalibration(awayRuns, homeRuns, total, strengthShare) {
        var marketTotal = Number(total);
        if (!Number.isFinite(marketTotal) || marketTotal < 5.5 || marketTotal > 14.5) return { awayRuns: awayRuns, homeRuns: homeRuns, applied: false };
        var currentTotal = awayRuns + homeRuns;
        if (!Number.isFinite(currentTotal) || currentTotal <= 0) return { awayRuns: awayRuns, homeRuns: homeRuns, applied: false };
        var targetTotal = (currentTotal * 0.78) + (marketTotal * 0.22);
        var scale = clamp(targetTotal / currentTotal, 0.9, 1.1);
        var awayShare = clamp(strengthShare || 0.5, 0.38, 0.62);
        return {
            awayRuns: clamp((awayRuns * scale * 0.88) + (targetTotal * awayShare * 0.12), 1.5, 8.8),
            homeRuns: clamp((homeRuns * scale * 0.88) + (targetTotal * (1 - awayShare) * 0.12), 1.5, 8.8),
            applied: true
        };
    }
    function inningWeights(isHome) {
        return isHome ? [0.108, 0.111, 0.114, 0.113, 0.112, 0.112, 0.112, 0.109, 0.109] : [0.111, 0.112, 0.114, 0.113, 0.112, 0.111, 0.109, 0.109, 0.109];
    }
    function controlledFinalScore(expected, opponentExpected, winShare, random) {
        var base = clamp(expected, 1.6, 8.9);
        var lambda = clamp(base * (0.74 + random() * 0.28), 0.9, 7.2);
        var score = poisson(lambda, random, 4.85);
        if (random() < 0.12) score += poisson(clamp(base * 0.14, 0.1, 1.4), random);
        if (base >= 4.6 && score <= 2 && random() < 0.24) score += 1;
        if (base >= 5.0 && score <= 3 && random() < 0.14) score += 1;
        if (base >= 5.4 && winShare > 0.62 && random() < 0.12) score += 2 + poisson(0.75, random);
        if (base >= 6.5 && random() < 0.08) score += 1 + poisson(0.6, random);
        if (winShare > 0.58 && random() < 0.22) score += 1;
        if (winShare < 0.38 && random() < 0.08) score = Math.max(0, score - 1);
        var rareOutlier = random() < 0.006 && base >= 5.7;
        var cap = rareOutlier ? 20 : (base >= 6.6 ? 16 : (base <= 3.2 ? 10 : 13));
        if (opponentExpected >= 6.2 && score > 14 && !rareOutlier) cap = Math.min(cap, 14);
        return clamp(score, 0, cap);
    }
    function distributeRuns(total, expected, random, isHome) {
        var weights = inningWeights(isHome);
        var innings = weights.map(function () { return 0; });
        var remaining = total;
        weights.forEach(function (weight, index) {
            if (index === 8) return;
            var lambda = clamp(expected * weight * (0.72 + random() * 0.68), 0.02, 1.85);
            var maxInning = remaining >= 10 ? 6 : 4;
            var runs = Math.min(remaining, Math.min(maxInning, poisson(lambda, random)));
            innings[index] = runs;
            remaining -= runs;
        });
        while (remaining > 0) {
            var idx = Math.floor(random() * 9);
            if (innings[idx] < (remaining > 6 ? 6 : 4)) {
                innings[idx] += 1;
                remaining -= 1;
            }
        }
        return innings;
    }
    function hitTotalForRuns(runs, team, pitcher, random) {
        var offenseLift = clamp((team.offense - 100) * 0.025, -0.7, 0.9);
        var pitcherDrag = pitcher ? clamp((100 - pitcher.quality) * 0.012, -0.35, 0.45) : 0;
        return Math.round(clamp(runs + 4.2 + offenseLift + pitcherDrag + (random() * 3.8), Math.max(runs, 1), 18));
    }
    function errorTotal(team, random) {
        var prevention = clamp((104 - team.runPrevention) * 0.012, -0.25, 0.35);
        var chance = clamp(0.44 + prevention, 0.18, 0.78);
        var errors = random() < chance ? 1 : 0;
        if (random() < 0.06) errors += 1;
        return errors;
    }
    function allocateWhole(total, count, random, minimums) {
        var values = [];
        var remaining = Math.max(0, Math.round(total));
        for (var i = 0; i < count; i += 1) {
            var min = minimums && minimums[i] ? minimums[i] : 0;
            values.push(min);
            remaining -= min;
        }
        remaining = Math.max(0, remaining);
        while (remaining > 0) {
            values[Math.floor(random() * count)] += 1;
            remaining -= 1;
        }
        return values;
    }
    function weightedAllocate(total, weights, random, caps, minimums) {
        var count = weights.length;
        var values = [];
        var remaining = Math.max(0, Math.round(total));
        for (var i = 0; i < count; i += 1) {
            var min = minimums && minimums[i] ? minimums[i] : 0;
            values[i] = min;
            remaining -= min;
        }
        remaining = Math.max(0, remaining);
        var guard = 0;
        while (remaining > 0 && guard < 1000) {
            guard += 1;
            var available = [];
            var totalWeight = 0;
            for (var j = 0; j < count; j += 1) {
                var cap = caps && Number.isFinite(caps[j]) ? caps[j] : 99;
                if (values[j] < cap) {
                    var weight = Math.max(0.01, Number(weights[j] || 1));
                    available.push({ index: j, weight: weight });
                    totalWeight += weight;
                }
            }
            if (!available.length) break;
            var pick = random() * totalWeight;
            for (var k = 0; k < available.length; k += 1) {
                pick -= available[k].weight;
                if (pick <= 0 || k === available.length - 1) {
                    values[available[k].index] += 1;
                    remaining -= 1;
                    break;
                }
            }
        }
        return values;
    }
    function sumAllocated(rows, key) {
        return rows.reduce(function (total, row) { return total + Number(row[key] || 0); }, 0);
    }
    function capBaserunnerOutliers(rows) {
        rows.forEach(function (row) {
            var outs = Number(row.outs || 0);
            var maxNoDamageHits = outs <= 3 ? 2 : (outs <= 6 ? 3 : 5);
            if (!row.r && row.h > maxNoDamageHits) row.r = Math.min(row.h - maxNoDamageHits, 2);
            if (row.er > row.r) row.er = row.r;
        });
    }
    function rosterNamesForBatters(roster) {
        var players = Array.isArray(roster && roster.players) ? roster.players : [];
        var pitchers = /^(P|SP|RP|CP|Relief|Pitcher)$/i;
        return players.filter(function (player) { return !pitchers.test(String(player.position || '')); }).map(function (player) {
            var pos = playerPositionLabel(player);
            return player.name + (pos ? ' (' + pos + ')' : '');
        }).slice(0, 9);
    }
    function rosterBatterSlotStats(roster, opposingHand) {
        var players = Array.isArray(roster && roster.players) ? roster.players : [];
        var pitchers = /^(P|SP|RP|CP|Relief|Pitcher)$/i;
        return players.filter(function (player) { return !pitchers.test(String(player.position || '')); }).slice(0, 9).map(function (player) {
            var seasonStat = player && player.mlbId ? cachedPlayerStat(player.mlbId, 'hitting') : null;
            var splitStat = player && player.mlbId && opposingHand ? cachedPlayerSplitVs(player.mlbId, 'hitting', opposingHand) : null;
            var splitPa = splitStat ? Number(splitStat.plateAppearances) : 0;
            var splitOk = splitStat && Number.isFinite(Number(splitStat.ops)) && splitPa >= 25;
            var seasonPa = seasonStat ? Number(seasonStat.plateAppearances) : 0;
            // SMALL_SAMPLE_REGRESSION_20260628: lowered the hard cutoff (was 30 PA) so a
            // bench bat with real numbers is no longer thrown out and rendered as a flat
            // league-average .245 hitter (a .105 backup catcher used to "hit" .248). Below
            // a full sample, each rate is regressed toward league by plate appearances, so
            // limited/weak hitters trend toward their (noise-corrected) true talent rather
            // than league average, and a hot small-sample line is not taken at face value.
            var seasonOk = seasonStat && Number.isFinite(Number(seasonStat.ops)) && seasonPa >= 15;
            var stat;
            var source;
            if (splitOk) {
                stat = splitStat;
                source = 'split';
            } else if (seasonOk) {
                stat = seasonStat;
                source = 'season';
            } else {
                stat = null;
                source = null;
            }
            var hasReal = !!stat;
            var paUsed = hasReal ? Number(stat.plateAppearances || 0) : 0;
            // Reliability weight: full trust by ~250 PA, floored so a real-but-tiny sample
            // still nudges off league average toward the player's observed line.
            var rw = clamp(paUsed / 250, 0.15, 1);
            var LG = { avg: 0.245, slg: 0.400, ops: 0.715, kRate: 0.225, bbRate: 0.085, hrRate: 0.033 };
            function reg(obs, lg) { return (obs == null || !Number.isFinite(obs)) ? lg : obs * rw + lg * (1 - rw); }
            var hrCount = seasonStat ? Number(seasonStat.homeRuns || 0) : 0;
            var hrRateObs = seasonOk && Number(seasonStat.atBats) > 0 ? hrCount / Number(seasonStat.atBats) : null;
            var kRateObs = hasReal && Number(stat.plateAppearances) > 0 ? Number(stat.strikeOuts || 0) / Number(stat.plateAppearances) : null;
            var bbRateObs = hasReal && Number(stat.plateAppearances) > 0 ? Number(stat.baseOnBalls || 0) / Number(stat.plateAppearances) : null;
            // Per-player base-stealing from real SB/CS (so speedsters run and sluggers
            // do not). Raw = attempts per time reaching 1B; normalized to the team rate
            // later in evBuildSide so the league SB total stays calibrated.
            var sSb = seasonStat ? Number(seasonStat.stolenBases || 0) : 0;
            var sCs = seasonStat ? Number(seasonStat.caughtStealing || 0) : 0;
            var sOn1b = seasonStat ? (Number(seasonStat.hits || 0) - Number(seasonStat.doubles || 0) - Number(seasonStat.triples || 0) - Number(seasonStat.homeRuns || 0) + Number(seasonStat.baseOnBalls || 0)) : 0;
            var sAtt = sSb + sCs;
            return {
                name: player.name,
                position: playerPositionLabel(player),
                mlbId: player.mlbId || null,
                batSide: player && player.mlbId ? batSideOf(player.mlbId) : null,
                ops: hasReal ? reg(Number(stat.ops), LG.ops) : null,
                avg: hasReal ? reg(Number(stat.avg), LG.avg) : null,
                slg: hasReal ? reg(Number(stat.slg), LG.slg) : null,
                // Raw (un-regressed) real line for DISPLAY only; the regressed values above
                // drive the simulation model.
                realAvgRaw: hasReal ? Number(stat.avg) : null,
                realOpsRaw: hasReal ? Number(stat.ops) : null,
                hr: hrCount,
                ab: hasReal ? Number(stat.atBats || 0) : 0,
                pa: paUsed,
                hrRate: hasReal ? reg(hrRateObs, LG.hrRate) : null,
                kRate: hasReal ? reg(kRateObs, LG.kRate) : null,
                bbRate: hasReal ? reg(bbRateObs, LG.bbRate) : null,
                real: hasReal,
                statSource: source,
                vsHand: opposingHand || null,
                sbRawRate: sOn1b >= 25 ? clamp(sAtt / sOn1b, 0, 0.6) : null,
                stealSucc: sAtt >= 6 ? clamp(sSb / sAtt, 0.5, 0.95) : null
            };
        });
    }
    function rosterNamesForPitchers(roster, starter) {
        var players = Array.isArray(roster && roster.players) ? roster.players : [];
        var names = [];
        if (starter && starter.name) names.push(starter.name);
        players.filter(function (player) { return /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || '')); }).forEach(function (player) {
            if (names.map(normalizeName).indexOf(normalizeName(player.name)) === -1) names.push(player.name);
        });
        return names.slice(0, 3);
    }
    function historicalRosterForTeam(team) {
        var key = team && (team.id || '').replace(/^classic-/, '');
        var batters = {
            '1927-nyy': ['Earle Combs (CF)', 'Mark Koenig (SS)', 'Babe Ruth (RF)', 'Lou Gehrig (1B)', 'Bob Meusel (LF)', 'Tony Lazzeri (2B)', 'Joe Dugan (3B)', 'Pat Collins (C)', 'Benny Bengough (C)'],
            '1939-nyy': ['Frankie Crosetti (SS)', 'Red Rolfe (3B)', 'Charlie Keller (RF)', 'Joe DiMaggio (CF)', 'Bill Dickey (C)', 'Joe Gordon (2B)', 'Tommy Henrich (1B)', 'George Selkirk (LF)', 'Babe Dahlgren (1B)'],
            '1955-bkn': ['Jim Gilliam (2B)', 'Pee Wee Reese (SS)', 'Duke Snider (CF)', 'Roy Campanella (C)', 'Gil Hodges (1B)', 'Jackie Robinson (3B)', 'Carl Furillo (RF)', 'Sandy Amoros (LF)', 'Don Zimmer (2B)'],
            '1961-nyy': ['Bobby Richardson (2B)', 'Tony Kubek (SS)', 'Roger Maris (RF)', 'Mickey Mantle (CF)', 'Elston Howard (C)', 'Yogi Berra (LF)', 'Bill Skowron (1B)', 'Clete Boyer (3B)', 'Hector Lopez (LF)'],
            '1969-nym': ['Tommie Agee (CF)', 'Bud Harrelson (SS)', 'Cleon Jones (LF)', 'Art Shamsky (RF)', 'Ed Kranepool (1B)', 'Ken Boswell (2B)', 'Jerry Grote (C)', 'Wayne Garrett (3B)', 'Ron Swoboda (RF)'],
            '1975-cin': ['Pete Rose (3B)', 'Ken Griffey (RF)', 'Joe Morgan (2B)', 'Johnny Bench (C)', 'Tony Perez (1B)', 'George Foster (LF)', 'Dave Concepcion (SS)', 'Cesar Geronimo (CF)', 'Dan Driessen (1B)'],
            '1984-det': ['Lou Whitaker (2B)', 'Alan Trammell (SS)', 'Kirk Gibson (RF)', 'Lance Parrish (C)', 'Darrell Evans (1B)', 'Chet Lemon (CF)', 'Larry Herndon (LF)', 'Tom Brookens (3B)', 'Dave Bergman (1B)'],
            '1986-nym': ['Lenny Dykstra (CF)', 'Wally Backman (2B)', 'Keith Hernandez (1B)', 'Gary Carter (C)', 'Darryl Strawberry (RF)', 'George Foster (LF)', 'Ray Knight (3B)', 'Rafael Santana (SS)', 'Mookie Wilson (OF)'],
            '1988-lad': ['Steve Sax (2B)', 'Mickey Hatcher (LF)', 'Kirk Gibson (RF)', 'Mike Marshall (1B)', 'John Shelby (CF)', 'Mike Scioscia (C)', 'Jeff Hamilton (3B)', 'Alfredo Griffin (SS)', 'Franklin Stubbs (1B)'],
            '1995-atl': ['Marquis Grissom (CF)', 'Mark Lemke (2B)', 'Chipper Jones (3B)', 'Fred McGriff (1B)', 'David Justice (RF)', 'Ryan Klesko (LF)', 'Javy Lopez (C)', 'Jeff Blauser (SS)', 'Mike Devereaux (OF)'],
            '1998-nyy': ['Chuck Knoblauch (2B)', 'Derek Jeter (SS)', 'Paul ONeill (RF)', 'Bernie Williams (CF)', 'Tino Martinez (1B)', 'Darryl Strawberry (DH)', 'Jorge Posada (C)', 'Scott Brosius (3B)', 'Chad Curtis (LF)'],
            '2001-sea': ['Ichiro Suzuki (RF)', 'Mark McLemore (LF)', 'Bret Boone (2B)', 'Edgar Martinez (DH)', 'John Olerud (1B)', 'Mike Cameron (CF)', 'David Bell (3B)', 'Dan Wilson (C)', 'Carlos Guillen (SS)'],
            '2004-bos': ['Johnny Damon (CF)', 'Orlando Cabrera (SS)', 'Manny Ramirez (LF)', 'David Ortiz (DH)', 'Kevin Millar (1B)', 'Trot Nixon (RF)', 'Jason Varitek (C)', 'Bill Mueller (3B)', 'Mark Bellhorn (2B)'],
            '2016-chc': ['Dexter Fowler (CF)', 'Kris Bryant (3B)', 'Anthony Rizzo (1B)', 'Ben Zobrist (LF)', 'Addison Russell (SS)', 'Willson Contreras (C)', 'Jason Heyward (RF)', 'Javier Baez (2B)', 'Kyle Schwarber (DH)'],
            '2017-hou': ['George Springer (CF)', 'Alex Bregman (3B)', 'Jose Altuve (2B)', 'Carlos Correa (SS)', 'Yuli Gurriel (1B)', 'Brian McCann (C)', 'Marwin Gonzalez (LF)', 'Josh Reddick (RF)', 'Carlos Beltran (DH)'],
            '2019-wsh': ['Trea Turner (SS)', 'Adam Eaton (RF)', 'Anthony Rendon (3B)', 'Juan Soto (LF)', 'Howie Kendrick (1B)', 'Asdrubal Cabrera (2B)', 'Victor Robles (CF)', 'Yan Gomes (C)', 'Kurt Suzuki (C)'],
            '2020-lad': ['Mookie Betts (RF)', 'Corey Seager (SS)', 'Justin Turner (3B)', 'Max Muncy (1B)', 'Will Smith (C)', 'Cody Bellinger (CF)', 'AJ Pollock (LF)', 'Chris Taylor (2B)', 'Joc Pederson (DH)'],
            '2021-atl': ['Jorge Soler (RF)', 'Freddie Freeman (1B)', 'Ozzie Albies (2B)', 'Austin Riley (3B)', 'Eddie Rosario (LF)', 'Adam Duvall (CF)', 'Dansby Swanson (SS)', 'Travis dArnaud (C)', 'Joc Pederson (DH)'],
            '2022-hou': ['Jose Altuve (2B)', 'Jeremy Pena (SS)', 'Yordan Alvarez (DH)', 'Alex Bregman (3B)', 'Kyle Tucker (RF)', 'Yuli Gurriel (1B)', 'Chas McCormick (CF)', 'Martin Maldonado (C)', 'Trey Mancini (LF)'],
            '2023-tex': ['Marcus Semien (2B)', 'Corey Seager (SS)', 'Adolis Garcia (RF)', 'Evan Carter (LF)', 'Josh Jung (3B)', 'Nathaniel Lowe (1B)', 'Mitch Garver (DH)', 'Jonah Heim (C)', 'Leody Taveras (CF)']
        };
        var pitchers = (HISTORICAL_PITCHERS[team && team.id] || []).map(function (row) { return { name: row[1], position: 'P' }; });
        return batters[key] ? { players: batters[key].map(function (name) { return { name: name.replace(/\s+\([A-Z0-9]+\)$/, ''), position: (name.match(/\(([A-Z0-9]+)\)$/) || [null, ''])[1] }; }).concat(pitchers), source: 'Curated historical roster names' } : null;
    }
    function rosterForTeam(team, roster) {
        var validated = validatedRosterForTeam(team, roster);
        if (validated && validated.players && validated.players.length) return validated;
        if (team && team.era === 'historical') return historicalRosterForTeam(team);
        return null;
    }
    function modeledBatterLines(team, line, random, roster, opposingHand) {
        var rosterNames = rosterNamesForBatters(roster);
        var slotStats = rosterBatterSlotStats(roster, opposingHand);
        var slotPosBase = [1.12, 1.02, 1.2, 1.15, 1.04, 0.98, 0.9, 0.86, 0.72];
        var runPosBase = [1.2, 1.1, 1.18, 1.05, 0.92, 0.9, 0.78, 0.78, 0.58];
        var kPosBase = [0.75, 0.9, 0.85, 0.95, 1.05, 1.1, 1.18, 1.2, 1.12];
        function opsFactor(stat) {
            if (!stat || !stat.real) return 1;
            return clamp(stat.ops / 0.720, 0.7, 1.45);
        }
        function kFactor(stat) {
            if (!stat || !stat.real || stat.kRate == null) return 1;
            return clamp(stat.kRate / 0.225, 0.55, 1.55);
        }
        function bbFactor(stat) {
            if (!stat || !stat.real || stat.bbRate == null) return 1;
            return clamp(stat.bbRate / 0.085, 0.55, 1.55);
        }
        var hitWeights = slotPosBase.map(function (base, i) { return base * opsFactor(slotStats[i]); });
        var runWeights = runPosBase.map(function (base, i) { return base * opsFactor(slotStats[i]); });
        var bbWeights = runPosBase.map(function (base, i) { return base * bbFactor(slotStats[i]); });
        var kWeights = kPosBase.map(function (base, i) { return base * kFactor(slotStats[i]); });
        var hits = weightedAllocate(line.hits, hitWeights, random, [5, 5, 5, 5, 4, 4, 4, 4, 4]);
        var runs = weightedAllocate(line.runs, runWeights, random, [4, 4, 4, 3, 3, 3, 3, 3, 3]);
        var rbiTotal = Math.max(0, line.runs - (random() < 0.35 ? 1 : 0));
        var rbi = weightedAllocate(rbiTotal, hitWeights.map(function (weight, index) { return weight + hits[index] * 0.45; }), random, [5, 5, 6, 6, 5, 5, 4, 4, 3]);
        var walks = weightedAllocate(clamp(Math.round(2 + random() * 4 + (team.offense - 100) * 0.04), 1, 8), bbWeights, random, [3, 3, 3, 3, 3, 3, 2, 2, 2]);
        var strikeouts = weightedAllocate(clamp(Math.round(6 + random() * 5 - (team.offense - 100) * 0.03), 3, 14), kWeights, random, [3, 3, 3, 4, 4, 4, 4, 4, 4]);
        var hrTotal = 0;
        var hrWeights = slotStats.map(function (stat, i) {
            var base = i >= 2 && i <= 5 ? 1.1 : 0.85;
            if (stat && stat.real && stat.hrRate != null) return base * clamp(stat.hrRate / 0.035, 0.2, 3.5);
            return base;
        });
        var hrRateSum = 0;
        var realHrSlots = 0;
        slotStats.forEach(function (s) {
            if (s && s.real && s.hrRate != null) {
                hrRateSum += s.hrRate;
                realHrSlots += 1;
            }
        });
        var meanHrRate = realHrSlots >= 5 ? hrRateSum / realHrSlots : 0.030;
        var teamAbEstimate = 32 + Math.floor(random() * 4);
        hrTotal = clamp(Math.round(meanHrRate * teamAbEstimate + (random() - 0.5) * 0.8), 0, 5);
        if (line.runs >= 7 && hrTotal < 2) hrTotal = 2;
        var hrPerSlot = weightedAllocate(hrTotal, hrWeights, random, [3, 3, 3, 3, 3, 2, 2, 2, 1]);
        return slotPosBase.map(function (_, index) {
            var statRow = slotStats[index];
            var topOfOrderBonus = index < 5 && random() < 0.45 ? 1 : 0;
            var ab = clamp(3 + Math.floor(random() * 2) + topOfOrderBonus, 2, 6);
            if (ab < hits[index]) ab = hits[index];
            if (strikeouts[index] > ab - hits[index]) strikeouts[index] = Math.max(0, ab - hits[index]);
            var hr = Math.min(hrPerSlot[index] || 0, hits[index]);
            var plainName = (statRow && statRow.name) || (rosterNames[index] ? rosterNames[index].replace(/\s*\([^)]*\)\s*$/, '') : '');
            var rawPos = (statRow && statRow.position) || ((rosterNames[index] || '').match(/\(([A-Z0-9]+)\)\s*$/) || [null, ''])[1];
            var gameAvg = ab > 0 ? hits[index] / ab : 0;
            var displayAvg = statRow && statRow.real && statRow.realAvgRaw != null ? statRow.realAvgRaw : gameAvg;
            var displayOps = statRow && statRow.real && statRow.realOpsRaw != null ? statRow.realOpsRaw : clamp(displayAvg * 2.55 + 0.18, 0.45, 1.25);
            return {
                name: (statRow && statRow.name && (statRow.position ? statRow.name + ' (' + statRow.position + ')' : statRow.name)) || rosterNames[index] || '',
                playerName: plainName,
                rawPos: rawPos,
                avg: displayAvg,
                ops: displayOps,
                ab: ab,
                r: runs[index],
                h: hits[index],
                hr: hr,
                rbi: rbi[index],
                bb: walks[index],
                so: strikeouts[index],
                statSource: statRow && statRow.real ? ((statRow.statSource === 'split' && statRow.vsHand ? ('Real ' + seasonYear() + ' vs ' + statRow.vsHand + 'HP OPS ' + (statRow.realOpsRaw != null ? statRow.realOpsRaw : statRow.ops).toFixed(3) + ' / AVG ' + (statRow.realAvgRaw != null ? statRow.realAvgRaw : statRow.avg).toFixed(3)) : ('Real ' + seasonYear() + ' season OPS ' + (statRow.realOpsRaw != null ? statRow.realOpsRaw : statRow.ops).toFixed(3) + ' / AVG ' + (statRow.realAvgRaw != null ? statRow.realAvgRaw : statRow.avg).toFixed(3))) + (statRow.hrRate != null ? ' / HR ' + statRow.hr : '')) : null
            };
        }).filter(function (row) { return row.name; });
    }
    function outsToIp(outs) {
        var innings = Math.floor(outs / 3);
        var remainder = outs % 3;
        return innings + (remainder ? '.' + remainder : '.0');
    }
    function modeledPitcherLines(team, opponentLine, starter, random, roster) {
        if (!roster || !roster.players || !roster.players.length) return [];
        var expectedDamage = opponentLine.runs + Math.max(0, opponentLine.hits - 7) * 0.35;
        var starterQuality = Number(starter && starter.quality);
        if (!Number.isFinite(starterQuality)) starterQuality = 100;
        var starterEra = Number(starter && starter.era);
        var starterStat = starter && starter.mlbId ? cachedPlayerStat(starter.mlbId, 'pitching') : null;
        var starterIpAvg = null, starterK9 = null, starterBB9 = null, starterHr9 = null;
        if (starterStat) {
            var statIp = Number(String(starterStat.inningsPitched || '0'));
            var statGs = Number(starterStat.gamesStarted || 0);
            if (statIp > 0 && statGs > 0) starterIpAvg = statIp / statGs;
            if (statIp > 0) {
                starterK9 = Number(starterStat.strikeOuts || 0) / statIp * 9;
                starterBB9 = Number(starterStat.baseOnBalls || 0) / statIp * 9;
                starterHr9 = Number(starterStat.homeRuns || 0) / statIp * 9;
            }
        }
        var qualityOuts = clamp(Math.round((starterQuality - 100) * 0.08), -3, 3);
        var eraOuts = Number.isFinite(starterEra) ? clamp(Math.round((4.2 - starterEra) * 0.9), -2, 2) : 0;
        var bullpenTrust = clamp(Math.round((team.bullpen - 100) * 0.04), -2, 2);
        var starterOuts;
        if (Number.isFinite(starterIpAvg)) {
            var realExpected = clamp(Math.round(starterIpAvg * 3), 9, 22);
            var damagePenalty = Math.floor(expectedDamage * 0.45);
            starterOuts = clamp(realExpected - damagePenalty + Math.floor(random() * 3) - 1, 9, 23);
        } else {
            starterOuts = clamp(17 - Math.floor(expectedDamage * 0.65) + Math.floor(random() * 4) + qualityOuts + eraOuts - Math.max(0, bullpenTrust), 9, 22);
        }
        if (opponentLine.runs >= 7 || opponentLine.hits >= 13) starterOuts = clamp(starterOuts - 2 - Math.max(0, bullpenTrust), 8, 18);
        if (starterQuality >= 112 && opponentLine.runs <= 3 && opponentLine.hits <= 8) starterOuts = clamp(starterOuts + 2, 15, 23);
        if (starterQuality <= 92 || (Number.isFinite(starterEra) && starterEra >= 4.9)) starterOuts = clamp(starterOuts - 1, 8, 19);
        if (Number.isFinite(starterK9) && Number.isFinite(starterBB9)) {
            var pullPitches = 95 + Math.floor(random() * 18);
            var pitchesPerPa = clamp(3.80 + (starterK9 - 8.5) * 0.05 + (starterBB9 - 3.0) * 0.07, 3.45, 4.45);
            var batterReachRate = 0.305 + clamp((starterBB9 - 3.0) * 0.010, -0.04, 0.05);
            var paForStarter = starterOuts / (1 - batterReachRate);
            var pitchEstimate = paForStarter * pitchesPerPa;
            if (pitchEstimate > pullPitches) {
                var cappedPa = pullPitches / pitchesPerPa;
                var cappedOuts = Math.floor(cappedPa * (1 - batterReachRate));
                starterOuts = clamp(Math.min(starterOuts, cappedOuts), 9, 22);
            }
        }
        var reliefOuts = 27 - starterOuts;
        var secondRelief = reliefOuts >= 9 ? clamp(3 + Math.floor(random() * 3), 3, reliefOuts - 3) : Math.floor(reliefOuts / 2);
        var outs = [starterOuts, secondRelief, reliefOuts - secondRelief];
        var outWeights = outs.map(function (out) { return Math.max(1, out / 3); });
        var starterRunRisk = clamp(1 + ((100 - starterQuality) * 0.012) + (Number.isFinite(starterEra) ? (starterEra - 4.2) * 0.16 : 0), 0.58, 1.55);
        var reliefRunRisk = clamp(1 + ((100 - team.bullpen) * 0.014), 0.72, 1.45);
        var runs = weightedAllocate(opponentLine.runs, outWeights.map(function (weight, index) { return weight * (index === 0 ? starterRunRisk : reliefRunRisk); }), random, outs.map(function (out) { return clamp(Math.ceil(out / 3) + 3, 1, 8); }));
        var hitCaps = outs.map(function (out, index) {
            var cap = Math.ceil(out * 0.72) + runs[index] * 2 + (index === 0 ? 3 : 1);
            var max = index === 0 ? 12 : (out <= 3 ? 4 : 5);
            if (!runs[index] && out <= 6) max = Math.min(max, out <= 3 ? 3 : 4);
            return clamp(cap, 1, max);
        });
        var hits = weightedAllocate(opponentLine.hits, outWeights.map(function (weight, index) { return weight * (index === 0 ? starterRunRisk : reliefRunRisk) + runs[index] * 1.1; }), random, hitCaps);
        var bullpenLive = teamLiveBullpenFactor(team);
        var bullpenK9 = bullpenLive && Number.isFinite(bullpenLive.meanK9) ? bullpenLive.meanK9 : null;
        var bullpenBb9 = bullpenLive && Number.isFinite(bullpenLive.meanBb9) ? bullpenLive.meanBb9 : null;
        var bullpenHr9 = bullpenLive && Number.isFinite(bullpenLive.meanHr9) ? bullpenLive.meanHr9 : null;
        var teamWalkTotal;
        var teamKTotal;
        var reliefOutsTotal = outs[1] + outs[2];
        if (Number.isFinite(starterBB9) && Number.isFinite(starterK9)) {
            var starterExpectedBB = (starterBB9 / 9) * starterOuts;
            var reliefBB = Number.isFinite(bullpenBb9)
                ? (bullpenBb9 / 9) * reliefOutsTotal
                : clamp((100 - team.bullpen) * 0.015 + random() * 2, 0.4, 4);
            teamWalkTotal = clamp(Math.round(starterExpectedBB + reliefBB + (random() - 0.5)), 1, 9);
            var starterExpectedK = (starterK9 / 9) * starterOuts;
            var reliefK = Number.isFinite(bullpenK9)
                ? (bullpenK9 / 9) * reliefOutsTotal
                : clamp(2 + (team.bullpen - 100) * 0.02 + random() * 2.5, 1, 6);
            teamKTotal = clamp(Math.round(starterExpectedK + reliefK + (random() - 0.5) * 1.5), 3, 18);
        } else {
            teamWalkTotal = clamp(Math.round(2 + random() * 3 + (100 - team.bullpen) * 0.015), 1, 8);
            teamKTotal = clamp(Math.round(7 + random() * 5 + (starterQuality - 100) * 0.05 + (team.bullpen - 100) * 0.018), 3, 16);
        }
        var walks = weightedAllocate(teamWalkTotal, outWeights.map(function (weight, index) { return weight * (index === 0 ? starterRunRisk : reliefRunRisk); }), random, outs.map(function (out) { return clamp(Math.ceil(out / 4) + 1, 1, 4); }));
        var starterKWeight = Number.isFinite(starterK9) ? clamp(starterK9 / 8.5, 0.55, 1.6) : clamp(1 + (starterQuality - 100) * 0.01, 0.75, 1.35);
        var reliefKWeight = Number.isFinite(bullpenK9) ? clamp(bullpenK9 / 8.5, 0.6, 1.6) : clamp(1 + (team.bullpen - 100) * 0.008, 0.8, 1.25);
        var strikeouts = weightedAllocate(teamKTotal, outWeights.map(function (weight, index) { return weight * (index === 0 ? starterKWeight : reliefKWeight); }), random, outs.map(function (out) { return Math.max(1, out); }));
        var starterHrExpected = Number.isFinite(starterHr9) ? (starterHr9 / 9) * starterOuts : null;
        var reliefHrExpected = Number.isFinite(bullpenHr9) ? (bullpenHr9 / 9) * reliefOutsTotal : null;
        var hrTeamTotal;
        if (Number.isFinite(starterHrExpected) && Number.isFinite(reliefHrExpected)) {
            hrTeamTotal = clamp(Math.round(starterHrExpected + reliefHrExpected + (random() - 0.5) * 0.8), 0, 5);
        } else {
            hrTeamTotal = clamp(Math.round(opponentLine.runs * 0.22 + random()), 0, 4);
        }
        var starterHrShare = Number.isFinite(starterHrExpected) ? starterHrExpected : runs[0] + 0.35;
        var setupHrShare = Number.isFinite(bullpenHr9) ? (bullpenHr9 / 9) * outs[1] : runs[1] + 0.35;
        var closerHrShare = Number.isFinite(bullpenHr9) ? (bullpenHr9 / 9) * outs[2] : runs[2] + 0.35;
        var hrWeights = [Math.max(0.05, starterHrShare), Math.max(0.05, setupHrShare), Math.max(0.05, closerHrShare)];
        var homers = weightedAllocate(hrTeamTotal, hrWeights, random, runs.map(function (run) { return Math.min(3, run + 1); }));
        var rosterNames = rosterNamesForPitchers(roster, starter);
        var names = [rosterNames[0] || (starter && starter.name) || '', rosterNames[1] || '', rosterNames[2] || ''];
        var rows = names.map(function (name, index) {
            return {
                name: name,
                outs: outs[index],
                ip: outsToIp(outs[index]),
                h: hits[index],
                r: runs[index],
                er: Math.max(0, runs[index] - (runs[index] && random() < 0.16 ? 1 : 0)),
                bb: walks[index],
                so: strikeouts[index],
                hr: homers[index]
            };
        }).filter(function (row) { return row.name && row.outs > 0; });
        return rows;
    }
    function lineupStatusFor(team, roster) {
        if (!roster || !roster.players || !roster.players.length) return null;
        if (team && team.era === 'historical') return { status: 'historical', badge: 'Curated historical lineup', confirmed: false };
        return {
            status: roster.lineupStatus || 'roster',
            badge: roster.lineupBadge || 'Active roster fallback (not a set batting order)',
            confirmed: !!roster.lineupConfirmed,
            // LINEUP_INTEGRITY_20260722 - hierarchy step 6 (freshness + provenance)
            rosterFeed: roster.rosterFeed || null,
            rosterFetchedAt: roster.rosterFetchedAt || roster.fetchedAt || null,
            lineupFeed: roster.lineupFeed || null,
            lineupFetchedAt: roster.lineupFetchedAt || null,
            lineupSourceGamePk: roster.lineupSourceGamePk || null,
            lineupSourceGameDate: roster.lineupSourceGameDate || null,
            removals: roster.lineupRemovals || [],
            backfills: roster.lineupBackfills || [],
            substitutesRejected: roster.substitutesRejected || [],
            todayTransactions: roster.todayTransactions || []
        };
    }
    // LINEUP_INTEGRITY_20260722: human-readable "how fresh is this" line.
    function lineupFreshnessNote(info) {
        if (!info) return '';
        var bits = [];
        function ago(ts) {
            if (!ts) return null;
            var mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
            return mins < 1 ? 'just now' : (mins < 60 ? mins + ' min ago' : Math.round(mins / 60) + ' hr ago');
        }
        var rAgo = ago(info.rosterFetchedAt);
        if (info.rosterFeed) bits.push('Active roster: ' + info.rosterFeed + (rAgo ? ' (refreshed ' + rAgo + ')' : ''));
        var lAgo = ago(info.lineupFetchedAt);
        if (info.lineupFeed) {
            bits.push('Lineup: ' + info.lineupFeed +
                (info.lineupSourceGameDate ? ', game ' + info.lineupSourceGameDate : '') +
                (info.lineupSourceGamePk ? ' #' + info.lineupSourceGamePk : '') +
                (lAgo ? ' (refreshed ' + lAgo + ')' : ''));
        }
        if (info.substitutesRejected && info.substitutesRejected.length) {
            bits.push('In-game substitutes excluded: ' + info.substitutesRejected.map(function (s) { return s.name + ' (slot ' + s.slot + ')'; }).join(', '));
        }
        if (info.removals && info.removals.length) {
            bits.push('Removed as inactive: ' + info.removals.map(function (r) { return r.name + ' - ' + r.reason; }).join('; '));
        }
        if (info.backfills && info.backfills.length) {
            bits.push('Backfilled from active roster: ' + info.backfills.map(function (b) { return b.name + ' (slot ' + b.slot + ')'; }).join(', '));
        }
        if (info.todayTransactions && info.todayTransactions.length) {
            bits.push('Same-day transactions detected: ' + info.todayTransactions.length);
        }
        return bits.join(' | ');
    }
    function modeledPlayerBox(away, home, awayLine, homeLine, awayPitcher, homePitcher, random, rosterContext) {
        var awayRoster = rosterForTeam(away, rosterContext && rosterContext.away);
        var homeRoster = rosterForTeam(home, rosterContext && rosterContext.home);
        return {
            away: {
                batters: modeledBatterLines(away, awayLine, random, awayRoster, homePitcher && homePitcher.mlbId ? pitchHandOf(homePitcher.mlbId) : null),
                pitchers: modeledPitcherLines(away, homeLine, awayPitcher, random, awayRoster),
                rosterSource: awayRoster && awayRoster.players && awayRoster.players.length ? (awayRoster.source || 'Projected lineup from verified active roster names') : 'Lineup unavailable. Verified roster data could not be loaded.',
                lineupStatus: lineupStatusFor(away, awayRoster)
            },
            home: {
                batters: modeledBatterLines(home, homeLine, random, homeRoster, awayPitcher && awayPitcher.mlbId ? pitchHandOf(awayPitcher.mlbId) : null),
                pitchers: modeledPitcherLines(home, awayLine, homePitcher, random, homeRoster),
                rosterSource: homeRoster && homeRoster.players && homeRoster.players.length ? (homeRoster.source || 'Projected lineup from verified active roster names') : 'Lineup unavailable. Verified roster data could not be loaded.',
                lineupStatus: lineupStatusFor(home, homeRoster)
            }
        };
    }
    function pitcherPitchCount(row) {
        var outs = Number(row.outs || 0);
        var pitches = clamp(Math.round(outs * 4.1 + Number(row.h || 0) * 4.6 + Number(row.bb || 0) * 5.2 + Number(row.so || 0) * 1.8), 8, 130);
        var strikes = clamp(Math.round(pitches * clamp(0.61 + Number(row.so || 0) * 0.008 - Number(row.bb || 0) * 0.018, 0.52, 0.71)), 4, pitches);
        return { pitches: pitches, strikes: strikes };
    }
    function teamSummaryStats(line, sidePlayers, random) {
        var batters = (sidePlayers && sidePlayers.batters) || [];
        var pitchers = (sidePlayers && sidePlayers.pitchers) || [];
        var walks = sum(batters.map(function (row) { return row.bb; }));
        var strikeouts = sum(batters.map(function (row) { return row.so; }));
        var homeRuns = sum(batters.map(function (row) { return row.hr || 0; }));
        var rbi = sum(batters.map(function (row) { return row.rbi; }));
        var hitsMinusHr = Math.max(0, line.hits - homeRuns);
        var doubles = clamp(Math.round(line.hits * 0.20), 0, hitsMinusHr);
        var triples = clamp(Math.round(line.hits * 0.03), 0, Math.max(0, hitsMinusHr - doubles));
        var singles = Math.max(0, hitsMinusHr - doubles - triples);
        var totalBases = singles + doubles * 2 + triples * 3 + homeRuns * 4;
        var twoOutRbi = clamp(Math.round(rbi * 0.4), 0, rbi);
        var lispLeft2Out = clamp(Math.round(line.hits * 0.12) + 1, 0, 5);
        var gidp = clamp(Math.round(line.hits / 6), 0, 3);
        var rispChances = clamp(Math.round(line.hits * 0.5) + 2, 1, 14);
        var rispHits = clamp(Math.round(line.runs * 0.45), 0, rispChances);
        var stolenBases = clamp(Math.round((line.hits + walks) * 0.06), 0, 3);
        var caughtStealing = stolenBases > 1 && random() < 0.5 ? 1 : 0;
        var pickoffs = random() < 0.12 ? 1 : 0;
        var outfieldAssists = random() < 0.18 ? 1 : 0;
        var dp = clamp(Math.round((27 - line.runs) / 18) + (random() < 0.4 ? 1 : 0), 0, 3);
        var leftOnBase = clamp(line.hits + walks - line.runs - caughtStealing - gidp, 0, 14);
        var totalPitches = 0;
        var totalStrikes = 0;
        pitchers.forEach(function (row) {
            var pc = pitcherPitchCount(row);
            totalPitches += pc.pitches;
            totalStrikes += pc.strikes;
        });
        return {
            doubles: doubles, triples: triples, homeRuns: homeRuns, rbi: rbi, walks: walks, strikeouts: strikeouts,
            stolenBases: stolenBases, caughtStealing: caughtStealing, leftOnBase: leftOnBase,
            totalPitches: totalPitches, totalStrikes: totalStrikes,
            hits: line.hits, runs: line.runs, errors: line.errors,
            totalBases: totalBases, twoOutRbi: twoOutRbi, lispLeft2Out: lispLeft2Out, gidp: gidp,
            rispText: rispHits + '-for-' + rispChances, pickoffs: pickoffs, outfieldAssists: outfieldAssists, dp: dp
        };
    }
    function assignLineupPositions(rows) {
        var REQUIRED = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
        var used = {};
        var assigned = [];
        var leftover = [];
        rows.slice(0, 9).forEach(function (row, index) {
            var pos = String(row.rawPos || '').toUpperCase();
            if (REQUIRED.indexOf(pos) !== -1 && !used[pos]) {
                used[pos] = true;
                assigned[index] = pos;
            } else {
                assigned[index] = null;
                leftover.push(index);
            }
        });
        var remaining = REQUIRED.filter(function (pos) { return !used[pos]; });
        leftover.forEach(function (index, order) {
            assigned[index] = remaining[order] || REQUIRED[order];
        });
        return assigned;
    }
    // Pitcher decisions (W/L/SV). ctx = { walkOff, extra, isHome }.
    // PITCHER_DECISIONS_20260628: handle walk-offs and extra-inning games the way the
    // official rules do, instead of always crediting the starter the win and the last
    // arm a save. Walk-off: the WINNING team's last pitcher (in when his team won it)
    // gets the W and NO save is awarded; the LOSING team's last pitcher (gave up the
    // walk-off) takes the L. Any extra-inning game: the starter can never be the winner
    // (the score was tied when he left), so the W goes to the reliever of record before
    // the final lead and the finisher can earn the save. Regulation: starter wins with
    // 5+ IP, else the bridge reliever; closer saves on a <=3-run lead or 3-inning finish.
    function pitcherDecisions(rows, isWinner, margin, ctx) {
        var labels = (rows || []).map(function () { return ''; });
        if (!rows || !rows.length) return labels;
        ctx = ctx || {};
        var last = rows.length - 1;
        var m = Number.isFinite(margin) ? margin : 1;
        if (isWinner) {
            if (ctx.walkOff && ctx.isHome) { labels[last] = 'W'; return labels; }
            var wIdx;
            if (ctx.extra) {
                wIdx = last >= 2 ? last - 1 : (rows.length > 1 ? 1 : 0);
            } else {
                wIdx = Number(rows[0].outs || 0) >= 15 ? 0 : (rows.length > 1 ? 1 : 0);
            }
            labels[wIdx] = 'W';
            if (rows.length > 1 && last !== wIdx) {
                var longFinish = Number(rows[last].outs || 0) >= 9;
                if (m <= 3 || longFinish) labels[last] = 'SV';
            }
        } else {
            labels[ctx.walkOff && !ctx.isHome ? last : 0] = 'L';
        }
        return labels;
    }
    // =========================================================================
    // Plate-appearance Monte Carlo engine. Box scores are simulated bottom-up,
    // one PA at a time, from per-batter outcome vectors combined with the actual
    // pitcher via the odds-ratio (log5) method, then advanced through a base/out
    // state machine. Lineup run output is anchored to the expected-run model
    // (which already folds in park, weather, pitcher, records, injuries, market),
    // so team totals stay MLB-accurate while the box score, win %, and run
    // distribution emerge from real events. Calibration (league-average inputs):
    // ~4.4 R/G, ~.245 AVG, K% ~23%, BB% ~9%, HR/G ~1.2, shutout ~13%.
    var EV_LEAGUE = { bb: 0.085, so: 0.225, hr: 0.030, b3: 0.004, b2: 0.046, b1: 0.148, out: 0.462 };
    var EV_LW = { b1: 0.47, b2: 0.78, b3: 1.05, hr: 1.40, bb: 0.32, out: -0.105 };
    var EV_PA_PER_GAME = 38.2;
    var EV_BF_PER_IP = 4.30;
    var EV_SLOT_OPS_MULT = [1.04, 1.08, 1.13, 1.15, 1.05, 0.98, 0.92, 0.86, 0.80];
    // Home-field run-environment split (Layer 3). Sum is fixed at 0.32 (unchanged
    // total run environment); the split is tuned so simulated home win % tracks the
    // real 2025 baseline without inflating the home/away run gap beyond reality.
    var HOME_FIELD_AWAY_BONUS = -0.02;
    var HOME_FIELD_HOME_BONUS = 0.34;
    function evNormalize(v) {
        var s = v.bb + v.so + v.hr + v.b3 + v.b2 + v.b1 + v.out;
        if (!(s > 0)) return Object.assign({}, EV_LEAGUE);
        return { bb: v.bb / s, so: v.so / s, hr: v.hr / s, b3: v.b3 / s, b2: v.b2 / s, b1: v.b1 / s, out: v.out / s };
    }
    function evLwRuns(v) {
        return EV_PA_PER_GAME * (EV_LW.b1 * v.b1 + EV_LW.b2 * v.b2 + EV_LW.b3 * v.b3 + EV_LW.hr * v.hr + EV_LW.bb * v.bb + EV_LW.out * (v.out + v.so));
    }
    function evBatterVector(s) {
        var paAb = (s && s.ab > 0 && s.pa > 0) ? s.ab / s.pa : 0.92;
        var bb = clamp(s && s.bbRate != null ? s.bbRate : EV_LEAGUE.bb, 0.02, 0.25);
        var so = clamp(s && s.kRate != null ? s.kRate : EV_LEAGUE.so, 0.05, 0.45);
        var hrPa = clamp((s && s.hrRate != null ? s.hrRate : 0.030) * paAb, 0.001, 0.10);
        var avg = s && s.avg != null ? s.avg : 0.245;
        var slg = s && s.slg != null ? s.slg : (avg + 0.155);
        var hitsPa = clamp(avg * paAb, 0.05, 0.42);
        var iso = Math.max(0, slg - avg);
        var nonHr = Math.max(0, hitsPa - hrPa);
        var xbNonHr = Math.max(0, iso * paAb - 3 * hrPa);
        var b3 = clamp((xbNonHr * 0.08) / (1 + 2 * 0.08), 0, nonHr * 0.4);
        var b2 = clamp(xbNonHr - 2 * b3, 0, nonHr);
        if (b2 + b3 > nonHr) { var sc = nonHr / (b2 + b3); b2 *= sc; b3 *= sc; }
        var b1 = Math.max(0, nonHr - b2 - b3);
        var out = Math.max(0.02, 1 - (bb + so + hrPa + b3 + b2 + b1));
        return evNormalize({ bb: bb, so: so, hr: hrPa, b3: b3, b2: b2, b1: b1, out: out });
    }
    function evSyntheticVector(teamOffense, slotIndex) {
        var teamFactor = clamp((teamOffense || 100) / 100, 0.8, 1.25);
        var combined = clamp(teamFactor * (EV_SLOT_OPS_MULT[slotIndex] || 0.9), 0.7, 1.4);
        return evBatterVector({
            avg: clamp(0.245 * Math.pow(combined, 0.55), 0.18, 0.33),
            slg: clamp((0.245 * Math.pow(combined, 0.55)) + 0.155 * combined, 0.30, 0.62),
            hrRate: clamp(0.030 * Math.pow(combined, 1.4), 0.005, 0.075),
            kRate: clamp(0.225 / Math.pow(combined, 0.45), 0.12, 0.34),
            bbRate: clamp(0.085 * Math.pow(combined, 0.5), 0.04, 0.16),
            ab: 0.92, pa: 1
        });
    }
    function evOdds(p) { p = clamp(p, 1e-4, 0.9999); return p / (1 - p); }
    function evFromOdds(o) { return o / (1 + o); }
    function evPitcherVector(pitcher, fallbackQuality) {
        var quality = Number(pitcher && pitcher.quality);
        if (!Number.isFinite(quality)) quality = Number.isFinite(fallbackQuality) ? fallbackQuality : 100;
        var k9, bb9, hr9;
        var stat = pitcher && pitcher.mlbId ? cachedPlayerStat(pitcher.mlbId, 'pitching') : null;
        var ip = stat ? Number(String(stat.inningsPitched || '0')) : 0;
        if (stat && ip >= 10) {
            // PITCHER_TRUE_TALENT_20260629: regress each rate toward league by innings,
            // since in-season pitcher rates are noisy at different speeds (K stabilizes
            // fast, BB medium, HR slow). A starter with a few gopher-ball starts no longer
            // reads as a true gopher-baller — the box-score sim (and thus the win %) uses
            // true-talent rates. Synthetic teams (offline gate) have no stat -> unaffected.
            var rawK9 = Number(stat.strikeOuts || 0) / ip * 9;
            var rawBB9 = Number(stat.baseOnBalls || 0) / ip * 9;
            var rawHR9 = Number(stat.homeRuns || 0) / ip * 9;
            k9 = (ip * rawK9 + 25 * 8.6) / (ip + 25);
            bb9 = (ip * rawBB9 + 45 * 3.1) / (ip + 45);
            hr9 = (ip * rawHR9 + 90 * 1.16) / (ip + 90);
        } else {
            k9 = 8.6 + (quality - 100) * 0.10;
            bb9 = 3.1 - (quality - 100) * 0.03;
            hr9 = 1.15 - (quality - 100) * 0.012;
        }
        return {
            so: clamp((k9 / 9) / EV_BF_PER_IP, 0.05, 0.45),
            bb: clamp((bb9 / 9) / EV_BF_PER_IP, 0.02, 0.22),
            hr: clamp((hr9 / 9) / EV_BF_PER_IP, 0.004, 0.085),
            hitFactor: clamp(1 - (quality - 100) * 0.006, 0.78, 1.20)
        };
    }
    function evStaffVector(team, fromBullpen) {
        var live = fromBullpen ? teamLiveBullpenFactor(team) : null;
        var rating = fromBullpen ? (team && team.bullpen || 100) : (team && team.startingPitching || 100);
        var k9, bb9, hr9;
        if (live && Number.isFinite(live.meanK9)) {
            k9 = live.meanK9; bb9 = Number.isFinite(live.meanBb9) ? live.meanBb9 : 3.2; hr9 = Number.isFinite(live.meanHr9) ? live.meanHr9 : 1.1;
        } else {
            k9 = 8.6 + (rating - 100) * 0.09; bb9 = 3.2 - (rating - 100) * 0.02; hr9 = 1.15 - (rating - 100) * 0.011;
        }
        return {
            so: clamp((k9 / 9) / EV_BF_PER_IP, 0.05, 0.45),
            bb: clamp((bb9 / 9) / EV_BF_PER_IP, 0.02, 0.22),
            hr: clamp((hr9 / 9) / EV_BF_PER_IP, 0.004, 0.085),
            hitFactor: clamp(1 - (rating - 100) * 0.005, 0.80, 1.18)
        };
    }
    // K-rate trim (June 4, 2026 calibration vs real MLB 2025): the engine ran
    // K/team +0.6 hot (8.96 vs 8.36). Trim strikeouts and move the removed mass
    // to in-play outs so on-base/run rates stay anchored. Applied inside
    // evCombine so the anchor and live play see the same distribution.
    var EV_K_TRIM = 0.88;
    // log5/odds-ratio bias correction (Morey & Cohen 2015): the odds-ratio combine is the
    // correct standard for batter x pitcher matchups, but it is documented to OVER-skew at
    // probabilities far from .500. Walks (~0.085) and HR (~0.030) are low-base events, so
    // the raw combine over-predicts both for above-average inputs. A light shrink of the
    // combined rate toward league (only the portion ABOVE league) removes that skew while
    // leaving average matchups byte-identical. Walks are NO LONGER scaled by the run anchor
    // (see evScale), so this correction is the only walk adjustment and it is principled,
    // not a run-target hack.
    var EV_BB_BIAS = 0.80; // shrink the above-league walk excess (1.0 = raw log5)
    var EV_HR_BIAS = 0.92; // light same-direction shrink for the low-base HR combine
    function evCombine(bv, pv) {
        function orc(b, p, l) { return evFromOdds(evOdds(b) * evOdds(p) / evOdds(l)); }
        function deskew(raw, league, k) { return raw > league ? league + (raw - league) * k : raw; }
        var hf = pv && pv.hitFactor != null ? pv.hitFactor : 1;
        var soRaw = orc(bv.so, pv.so, EV_LEAGUE.so);
        var soTrimmed = soRaw * EV_K_TRIM;
        var bb = clamp(deskew(orc(bv.bb, pv.bb, EV_LEAGUE.bb), EV_LEAGUE.bb, EV_BB_BIAS), 0.02, 0.150);
        var hr = clamp(deskew(orc(bv.hr, pv.hr, EV_LEAGUE.hr), EV_LEAGUE.hr, EV_HR_BIAS), 0.004, 0.090);
        return evNormalize({
            bb: bb,
            so: soTrimmed,
            hr: hr,
            b3: bv.b3 * hf, b2: bv.b2 * hf, b1: bv.b1 * hf,
            out: Math.max(0.02, bv.out) + (soRaw - soTrimmed)
        });
    }
    // ULTRA_REAL_20260628: the run anchor flexes a lineup to its target run level by
    // scaling HITS and POWER only — NOT walks. Walk rate is plate-discipline x pitcher
    // control (a stable matchup property from the log5 combine), not a run dial; the old
    // code scaled bb by f too, which inflated walks for high-scoring lineups (LAD/NYY ran
    // 6+ BB/gm). Holding bb fixed and moving all run-environment scaling onto BABIP/power
    // is how real base-out/linear-weights models behave and yields realistic walk totals
    // with no post-hoc compression hack. evAnchorFactor solves f over THIS function, so
    // the anchor automatically compensates through hits.
    function evScale(v, f) {
        // Walks track the run environment only PARTIALLY (~1/3 as much as hits): plate
        // discipline is mostly matchup-driven, so high-scoring lineups get there mainly
        // through hits/power. Scaling walks 0% (hits carry everything) inflated realized
        // batting averages ~.017; this split keeps walks realistic AND AVG honest.
        var bbF = 1 + (f - 1) * 0.35;
        var nv = { bb: v.bb * bbF, so: v.so, hr: v.hr * f, b3: v.b3 * f, b2: v.b2 * f, b1: v.b1 * f, out: v.out };
        var posOld = v.bb + v.hr + v.b3 + v.b2 + v.b1, posNew = nv.bb + nv.hr + nv.b3 + nv.b2 + nv.b1;
        nv.out = Math.max(0.02, v.out + (posOld - posNew));
        return evNormalize(nv);
    }
    function evApplyParkHr(v, hrFactor) {
        if (!hrFactor || hrFactor === 1) return v;
        return evNormalize({ bb: v.bb, so: v.so, hr: v.hr * hrFactor, b3: v.b3, b2: v.b2, b1: v.b1, out: v.out });
    }
    function evBlend(v1, v2, w) {
        var k = ['bb', 'so', 'hr', 'b3', 'b2', 'b1', 'out'], o = {};
        k.forEach(function (key) { o[key] = v1[key] * w + v2[key] * (1 - w); });
        return evNormalize(o);
    }
    // Roughly league-average opposing pitcher (used to represent relief innings in
    // the run anchor, since combining a batter against a league pitcher returns the
    // batter's own rate).
    var EV_LEAGUE_PITCHER = { bb: EV_LEAGUE.bb, so: EV_LEAGUE.so, hr: EV_LEAGUE.hr, hitFactor: 1 };
    // Times-through-the-order multipliers, centered near the 2nd pass so the full
    // game stays mean-calibrated: a fresh pitcher misses more bats and yields fewer
    // homers; the 3rd time through the lineup he fades (the well-documented TTOP).
    function evTtoMultipliers(timesThrough) {
        if (timesThrough <= 1) return { so: 1.06, hr: 0.92, hit: 0.96 };
        if (timesThrough === 2) return { so: 1.0, hr: 1.0, hit: 1.0 };
        if (timesThrough === 3) return { so: 0.93, hr: 1.10, hit: 1.05 };
        return { so: 0.88, hr: 1.18, hit: 1.09 };
    }
    function evApplyTto(v, m) {
        if (!m) return v;
        return evNormalize({ bb: v.bb, so: v.so * m.so, hr: v.hr * m.hr, b3: v.b3 * m.hit, b2: v.b2 * m.hit, b1: v.b1 * m.hit, out: Math.max(0.02, v.out) });
    }
    // Target-aware correction between the linear-weights anchor target and the
    // realized simulated mean. The engine tracks low/medium targets near unity but
    // compounds above ~4.4 R/G (high-OBP lineups rally more than linear weights
    // predict), so the correction shrinks as the target rises. Quadratic fit (~exact
    // across T=3.0-6.5) to the realized-vs-target curve measured by
    // scripts/validate-mlb-simulator.cjs; replaces the old fixed 0.985 that was
    // tuned only at ~4.4 and let lopsided matchups overshoot.
    function evAnchorTargetCorrection(t) {
        // June 4, 2026 rescale, re-measured twice against the harness:
        //   x0.969 after the game-rules pass (errors/K/placed runners) ran +3.2% hot;
        //   x1.003 after the event-sourced outputs pass (pickoffs + outfield-assist
        //   outs) ran -3.8% cold at x0.969 (4.28 vs 4.45 R/team). Interpolated from
        //   the two measured points; x1.024 after the GIDP-rate calibration (0.11 ->
        //   0.21) removed ~2.7% of runs (harness 4.35 vs 4.45 at x1.003). See
        //   scripts/validate-mlb-simulator.cjs and docs/mlb-simulator-calibration.md.
        //   Any layer that adds or removes baserunners/outs MUST re-measure this factor.
        return clamp((0.985 + 0.02752 * t - 0.006719 * t * t) * 1.024, 0.80, 1.0);
    }
    function evAnchorFactor(combinedVectors, targetRuns) {
        var t = clamp(targetRuns, 1.4, 11);
        var target = t * evAnchorTargetCorrection(t);
        function runsAt(f) {
            var avg = { bb: 0, so: 0, hr: 0, b3: 0, b2: 0, b1: 0, out: 0 };
            combinedVectors.forEach(function (v) { var sv = evScale(v, f); for (var k in avg) avg[k] += sv[k] / combinedVectors.length; });
            return evLwRuns(avg);
        }
        var lo = 0.2, hi = 2.6;
        for (var i = 0; i < 30; i++) { var m = (lo + hi) / 2; if (runsAt(m) < target) lo = m; else hi = m; }
        return (lo + hi) / 2;
    }
    function evSample(v, random) {
        var r = random();
        if ((r -= v.bb) < 0) return 'bb';
        if ((r -= v.so) < 0) return 'so';
        if ((r -= v.hr) < 0) return 'hr';
        if ((r -= v.b3) < 0) return 'b3';
        if ((r -= v.b2) < 0) return 'b2';
        if ((r -= v.b1) < 0) return 'b1';
        return 'out';
    }
    function evNewBat() { return { pa: 0, ab: 0, h: 0, b1: 0, b2: 0, b3: 0, hr: 0, bb: 0, ibb: 0, so: 0, r: 0, rbi: 0, sb: 0, cs: 0, sf: 0, sac: 0, hbp: 0, gidp: 0, lob: 0 }; }
    function evNewPit() { return { outs: 0, h: 0, bb: 0, ibb: 0, so: 0, hr: 0, hbp: 0, r: 0, er: 0, bf: 0, pitches: 0, strikes: 0, fps: 0, whiff: 0, gb: 0, fb: 0, ir: 0, irs: 0 }; }
    // HBP_SHARE_20260703: hit-by-pitch is carved from the calibrated free-pass rate
    // (identical base state to a walk), so run scoring / win probability are byte-
    // unchanged; only the free pass's LABEL changes. ~0.13 of walks -> ~0.42 HBP/team-
    // game (real MLB 2025 ~0.40), leaving BB ~2.8/team (well within the validator tol).
    var EV_HBP_SHARE = 0.13;
    // Build per-team lineup (anchored batter vectors + display rows) and staff.
    function evBuildSide(team, oppPitcher, ownStarter, targetRuns, rosterContext, parkHr) {
        var roster = rosterForTeam(team, rosterContext);
        var oppHand = oppPitcher && oppPitcher.mlbId ? pitchHandOf(oppPitcher.mlbId) : null;
        var slotStats = roster ? rosterBatterSlotStats(roster, oppHand) : [];
        // PLATOON_VS_RELIEVER_20260623: also resolve each batter's vs-LHP and vs-RHP
        // split vectors. baseVec stays built vs the opposing STARTER's hand (so the
        // ~72% starter share is byte-identical to before), but evPlayHalf swaps to the
        // correct platoon split when a reliever of a different hand enters. Both fall
        // back to baseVec when a batter has no usable split, so synthetic/no-split
        // teams and the offline harness are completely unchanged.
        var slotStatsL = roster ? rosterBatterSlotStats(roster, 'L') : [];
        var slotStatsR = roster ? rosterBatterSlotStats(roster, 'R') : [];
        var names = roster ? rosterNamesForBatters(roster) : [];
        var oppVec = evPitcherVector(oppPitcher, 100);
        var lineup = [];
        for (var i = 0; i < 9; i++) {
            var s = slotStats[i];
            var baseVec = (s && s.real) ? evBatterVector(s) : evSyntheticVector(team && team.offense, i);
            var sL = slotStatsL[i], sR = slotStatsR[i];
            var baseVecVsL = (sL && sL.real) ? evBatterVector(sL) : baseVec;
            var baseVecVsR = (sR && sR.real) ? evBatterVector(sR) : baseVec;
            var plainName = (s && s.name) || (names[i] ? names[i].replace(/\s*\([^)]*\)\s*$/, '') : '');
            var rawPos = (s && s.position) || ((names[i] || '').match(/\(([A-Z0-9]+)\)\s*$/) || [null, ''])[1];
            lineup.push({
                pid: (s && s.mlbId) ? ('id' + s.mlbId) : ('sl' + i + '_' + normalizeName(plainName || ('slot' + i))),
                baseVec: baseVec,
                baseVecVsL: baseVecVsL,
                baseVecVsR: baseVecVsR,
                playerName: plainName,
                name: (s && s.name && (s.position ? s.name + ' (' + s.position + ')' : s.name)) || names[i] || '',
                rawPos: rawPos,
                realAvg: (s && s.real && s.realAvgRaw != null) ? s.realAvgRaw : null,
                realOps: (s && s.real && s.realOpsRaw != null) ? s.realOpsRaw : null,
                statSource: (s && s.real) ? ((s.statSource === 'split' && s.vsHand ? ('Real ' + seasonYear() + ' vs ' + s.vsHand + 'HP') : ('Real ' + seasonYear() + ' season')) + ' OPS ' + Number(s.realOpsRaw != null ? s.realOpsRaw : s.ops).toFixed(3)) : null,
                sbRawRate: (s && s.sbRawRate != null) ? s.sbRawRate : null,
                stealSucc: (s && s.stealSucc != null) ? s.stealSucc : null,
                acc: evNewBat()
            });
        }
        // PER_PLAYER_STEALS_20260629: distribute the calibrated team steal rate by each
        // runner's real attempt rate, so fast players run often and sluggers almost never,
        // while the lineup mean stays at the team baseline (SB total unchanged). Players
        // with no real SB sample fall back to the league raw rate.
        var LG_SB_RAW = 0.075, TEAM_BASE_STEAL = 0.10;
        var rawRates = lineup.map(function (b) { return b.sbRawRate != null ? b.sbRawRate : LG_SB_RAW; });
        var rawMean = rawRates.reduce(function (a, c) { return a + c; }, 0) / (rawRates.length || 1);
        var stealScale = rawMean > 0 ? TEAM_BASE_STEAL / rawMean : 1;
        lineup.forEach(function (b, i) {
            b.stealRate = clamp(rawRates[i] * stealScale, 0, 0.5);
            b.stealSuccess = b.stealSucc != null ? b.stealSucc : 0.78;
            // SPEED_BASERUNNING_20260629: extra-base advancement multiplier from real
            // steal-attempt rate (a clean speed proxy), centered on the league runner
            // (0.075 -> 1.0) so the league-MEAN advancement is unchanged (calibration-
            // neutral) while burners take the extra base more and sluggers less.
            b.speed = clamp(1.0 + ((b.sbRawRate != null ? b.sbRawRate : LG_SB_RAW) - LG_SB_RAW) * 2.4, 0.82, 1.30);
        });
        // Anchor against a starter/bullpen blend (~72% of PAs face the opposing
        // starter, ~28% the bullpen, approximated as a league-average arm) with the
        // park HR effect baked in, so the calibrated mean reflects the real game mix
        // instead of assuming the starter pitches all nine innings.
        // PLATOON_VS_RELIEVER_20260623: the starter share uses the vs-starter-hand
        // split (baseVec), but the bullpen share faces a HAND MIX (league-typical
        // ~70% RHP / 30% LHP). Lineups are platoon-stacked vs the starter, so anchoring
        // the relief share on baseVec (the platoon-advantaged split) overstated offense
        // and left realized runs ~0.3-0.5 below target once opposite-hand relievers
        // entered at PA time. Anchoring the relief term on the batter's hand-blended
        // split makes the calibrated target match what evPlayHalf actually simulates.
        var combinedForAnchor = lineup.map(function (b) {
            var vsStarter = evApplyParkHr(evCombine(b.baseVec, oppVec), parkHr);
            var reliefBat = evBlend(b.baseVecVsR, b.baseVecVsL, 0.70);
            var vsLeague = evApplyParkHr(evCombine(reliefBat, EV_LEAGUE_PITCHER), parkHr);
            return evBlend(vsStarter, vsLeague, 0.72);
        });
        var anchorFactor = evAnchorFactor(combinedForAnchor, targetRuns);
        // pitching staff: own starter (faces opponent) -> set up -> closer
        var staffNames = roster ? rosterNamesForPitchers(roster, ownStarter) : (ownStarter && ownStarter.name ? [ownStarter.name] : []);
        var starterVec = evPitcherVector(ownStarter, 100);
        var penVec = evStaffVector(team, true);
        var starterOuts = evStarterOuts(ownStarter, team);
        // Multi-arm bullpen (Layer 2, June 22 2026): when verified reliever season
        // stats exist, sequence the real bridge -> setup -> closer, each with their
        // OWN K/BB/HR vector, real name, and handedness (when the profile is cached),
        // instead of one flat bucket. evActivePitcher reserves the closer for the 9th+
        // pocket and splits the bridge innings across the middle arms. Multi-inning
        // fatigue needs no separate term: the existing times-through-order penalty
        // already degrades any reliever left in to face the lineup again. Fail-open to
        // the prior 3-slot team-profile pen (RP + CL) when real arms are unavailable.
        var arms = evRelieverArms(roster, ownStarter);
        var pitchers = [
            { name: staffNames[0] || (ownStarter && ownStarter.name) || (team.abbreviation + ' SP'), vec: starterVec, acc: evNewPit(), role: 'SP', hand: ownStarter && ownStarter.mlbId ? pitchHandOf(ownStarter.mlbId) : null }
        ];
        if (arms) {
            arms.ordered.forEach(function (a) {
                var role = a === arms.closer ? 'CL' : (a === arms.setup ? 'SU' : 'RP');
                pitchers.push({ name: a.name, vec: evPitcherVector({ mlbId: a.mlbId }, 100), acc: evNewPit(), role: role, hand: a.hand || null });
            });
        } else {
            pitchers.push({ name: staffNames[1] || (team.abbreviation + ' RP'), vec: penVec, acc: evNewPit(), role: 'RP' });
            pitchers.push({ name: staffNames[2] || (team.abbreviation + ' CL'), vec: penVec, acc: evNewPit(), role: 'CL' });
        }
        // TMR_ROSTER_STATE_20260723: the bench pool (verified reserves) is built once
        // here and only ever consumed in the displayed game. Empty for synthetic teams.
        var benchPool = roster ? evBuildBench(team, roster, parkHr) : [];
        return {
            team: team, lineup: lineup, benchPool: benchPool, anchorFactor: anchorFactor, pitchers: pitchers,
            starterOuts: starterOuts, roster: roster, hasNamedLineup: !!(roster && roster.players && roster.players.length),
            // Error-rate calibration (June 4, 2026 vs real MLB 2025): engine ran
            // 0.31 errors/team vs real 0.504 — reach-on-error base raised to match.
            errRate: clamp(0.034 + (100 - (team && team.runPrevention || 100)) * 0.0006, 0.016, 0.055),
            parkHr: parkHr || 1, stealRate: 0.10, stealSuccess: 0.78, sb: 0, cs: 0
        };
    }
    // Layer 1: choose real bullpen arms from verified roster + cached season stats.
    // Returns null (fail-open) unless two qualified relievers are available.
    function evRelieverArms(roster, ownStarter) {
        var players = roster && Array.isArray(roster.players) ? roster.players : [];
        var starterKey = ownStarter && ownStarter.name ? normalizeName(ownStarter.name) : '';
        var arms = players.filter(function (p) {
            return p && p.mlbId && /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(p.position || '')) && normalizeName(p.name) !== starterKey;
        }).map(function (p) {
            var s = cachedPlayerStat(p.mlbId, 'pitching');
            if (!s) return null;
            var ip = Number(String(s.inningsPitched || '0'));
            var gs = Number(s.gamesStarted || 0), g = Number(s.gamesPlayed || 0);
            var era = Number(s.era);
            if (!Number.isFinite(ip) || ip < 10) return null;
            if (gs >= 4 || (g > 0 && gs / g >= 0.5)) return null; // exclude starters
            if (!Number.isFinite(era) || era <= 0 || era >= 30) return null;
            return { name: p.name, mlbId: p.mlbId, era: era, saves: Number(s.saves || 0), ip: ip, hand: pitchHandOf(p.mlbId) };
        }).filter(Boolean);
        if (arms.length < 2) return null;
        // Closer = saves leader (ERA tiebreak); setup + bridge = best ERAs remaining.
        var closer = arms.slice().sort(function (a, b) { return (b.saves - a.saves) || (a.era - b.era); })[0];
        var rest = arms.filter(function (a) { return a !== closer; }).sort(function (a, b) { return a.era - b.era; });
        var setup = rest[0];
        var bridge = rest[1] || null; // third real arm (best ERA after setup); null if only 2 qualify
        // Ordered low -> high leverage so evActivePitcher walks bridge -> setup -> closer.
        // (A 4th "long" arm was tested June 28 but overshot pitchers/team to 4.4 and,
        // by keeping late innings too fresh, pushed extra-inning games to ~15%; reverted.)
        var ordered = [];
        if (bridge) ordered.push(bridge);
        ordered.push(setup);
        ordered.push(closer);
        return { setup: setup, closer: closer, bridge: bridge, ordered: ordered };
    }
    function evStarterOuts(starter, team) {
        var quality = Number(starter && starter.quality); if (!Number.isFinite(quality)) quality = 100;
        var era = Number(starter && starter.era);
        var stat = starter && starter.mlbId ? cachedPlayerStat(starter.mlbId, 'pitching') : null;
        if (stat) {
            var ip = Number(String(stat.inningsPitched || '0')); var gs = Number(stat.gamesStarted || 0);
            if (ip > 0 && gs > 0) {
                // STARTER_LEN_REGRESS_20260628: outs-per-start from raw ip/gs is unstable
                // for small samples (a swingman with 3 starts + long relief reads as a
                // 7-IP "starter"). Regress toward the league per-start mean (~17 outs /
                // 5.2 IP) with weight by games started, and cap at 21 outs (7 IP) so no
                // simulated starter routinely throws a complete game. Established starters
                // (12+ GS) keep their real workload.
                var perStartOuts = (ip / gs) * 3;
                var w = clamp(gs / 12, 0, 1);
                return clamp(Math.round(perStartOuts * w + 17 * (1 - w)), 12, 21);
            }
        }
        var outs = 18 + (quality - 100) * 0.10;
        if (Number.isFinite(era)) outs += (4.2 - era) * 0.9;
        return clamp(Math.round(outs), 11, 22);
    }
    // Simulate one half inning for `bat` side against the active pitcher object.
    // endLead (optional): walk-off rule — the half ends as soon as runs exceed this
    // deficit (checked at the end of each PA, so a walk-off HR counts every run).
    // ghostSlot (optional): extra-innings placed runner (2020+ rule) — that lineup
    // slot starts the inning on 2B and scores as an UNEARNED run for the pitcher.
    // =====================================================================
    // TMR_EVENTLOG_20260723 (Stage 2) — the authoritative structured event log.
    //
    // Every displayed number (line score, batting table, pitching table,
    // play-by-play, game notes) is a FOLD over this one array. Nothing is
    // counted twice and nothing is invented at render time. The log is built
    // only for the displayed game; the 2000-game win-probability sample runs
    // with logging off so its cost is unchanged.
    //
    // The log does NOT drive the simulation - it records it. The one place it
    // changes engine behaviour is the pitch sequence: PC/ST used to be sampled
    // from a formula that could not produce a legal ball/strike progression
    // (a 4-pitch walk with 2 strikes). They are now a byproduct of a real
    // pitch-by-pitch sequence, so pitch counts reconcile with the pitch log.
    // That shifts the RNG stream, so the calibration gate is re-run.
    // =====================================================================
    var EL_TYPES = {
        PA: 'PA', STEAL: 'STEAL', PICKOFF: 'PICKOFF', SUB: 'SUB', INJURY: 'INJURY',
        EJECTION: 'EJECTION', INNING_START: 'INNING_START', INNING_END: 'INNING_END', GAME_END: 'GAME_END'
    };
    function elNewLog(gameId) {
        return { gameId: gameId || 'sim', seq: 0, events: [], scoring: [] };
    }
    function elPush(log, e) {
        if (!log) return null;
        e.gameId = log.gameId;
        e.seq = ++log.seq;
        log.events.push(e);
        return e;
    }
    // Deterministic auxiliary PRNG. Batted-ball detail (exit velocity, launch
    // angle, direction, distance) is cosmetic colour on an outcome the engine
    // has already decided, so it is drawn from a seeded stream keyed to the
    // event - never from the simulation's own random(), which would perturb
    // the calibrated model.
    function elRng(seed) {
        var s = (seed >>> 0) || 0x9e3779b9;
        return function () {
            s ^= s << 13; s >>>= 0;
            s ^= s >>> 17;
            s ^= s << 5; s >>>= 0;
            return s / 4294967296;
        };
    }
    function elHashSeed() {
        var h = 2166136261;
        for (var i = 0; i < arguments.length; i++) {
            var str = String(arguments[i]);
            for (var j = 0; j < str.length; j++) {
                h ^= str.charCodeAt(j);
                h = (h * 16777619) >>> 0;
            }
            h = (h ^ 0x9e3779b9) >>> 0;
        }
        return h >>> 0;
    }
    var EL_FIELD_NAMES = {
        LF: 'left field', LCF: 'left-center field', CF: 'center field', RCF: 'right-center field', RF: 'right field',
        '1B': 'first', '2B': 'second', '3B': 'third', SS: 'shortstop', P: 'the pitcher', C: 'the catcher'
    };
    var EL_BIP_NAMES = { GB: 'ground ball', LD: 'line drive', FB: 'fly ball', PU: 'pop up' };
    // Every play-by-play sentence is generated from the structured event, never
    // written by hand: outcome code + batted-ball detail + the run ledger.
    function elDescribePa(code, batter, pitcherName, bip, runsScored, outsAfter, ofAssist) {
        var where = bip ? (EL_FIELD_NAMES[bip.field] || bip.field) : null;
        var shape = bip ? EL_BIP_NAMES[bip.type] : null;
        var s;
        if (code === 'BB') s = batter + ' walks';
        else if (code === 'HBP') s = batter + ' is hit by a pitch';
        else if (code === 'K') s = batter + ' strikes out';
        else if (code === 'HR') s = batter + ' homers on a ' + shape + ' to ' + where + (bip && bip.dist ? ' (' + bip.dist + ' ft)' : '');
        else if (code === '3B') s = batter + ' triples on a ' + shape + ' to ' + where;
        else if (code === '2B') s = batter + ' doubles on a ' + shape + ' to ' + where;
        else if (code === '1B') s = batter + ' singles on a ' + shape + ' to ' + where;
        else if (code === 'E') s = batter + ' reaches on an error on a ' + shape + ' to ' + where;
        else if (code === 'SF') s = batter + ' hits a sacrifice fly to ' + where;
        else if (code === 'SH') s = batter + ' sacrifice bunts';
        else if (code === 'GIDP') s = batter + ' grounds into a double play, ' + where + ' to second to first';
        else s = batter + (bip && bip.type === 'GB' ? ' grounds out to ' + where : bip && bip.type === 'PU' ? ' pops out to ' + where : bip && bip.type === 'LD' ? ' lines out to ' + where : ' flies out to ' + where);
        var scorers = (runsScored || []).filter(function (r) { return r.runnerId; }).map(function (r) { return r.runnerId; });
        if (code === 'HR') scorers = scorers.filter(function (n) { return n !== batter; });
        if (scorers.length === 1) s += '. ' + scorers[0] + ' scores';
        else if (scorers.length > 1) s += '. ' + scorers.slice(0, -1).join(', ') + ' and ' + scorers[scorers.length - 1] + ' score';
        if (ofAssist) s += '. Runner thrown out at home';
        s += '. ' + (outsAfter >= 3 ? '3 outs' : outsAfter === 1 ? '1 out' : outsAfter + ' outs');
        return s;
    }
    var EL_FIELDS_GB = ['3B', 'SS', '2B', '1B', 'P'];
    var EL_FIELDS_AIR = ['LF', 'LCF', 'CF', 'RCF', 'RF'];
    // Batted-ball profile per outcome, anchored on real Statcast distributions.
    function elBattedBall(code, seed) {
        var r = elRng(seed);
        var type, ev, la, field, dist = null;
        if (code === 'hr') {
            type = r() < 0.14 ? 'LD' : 'FB';
            ev = 98 + r() * 14;
            la = 20 + r() * 15;
            dist = Math.round(365 + (ev - 98) * 7 + (r() - 0.5) * 40);
            field = EL_FIELDS_AIR[Math.floor(r() * 5)];
        } else if (code === 'b3') {
            type = r() < 0.55 ? 'LD' : 'FB';
            ev = 95 + r() * 12; la = 8 + r() * 18;
            field = r() < 0.55 ? 'RCF' : (r() < 0.5 ? 'LCF' : 'CF');
        } else if (code === 'b2') {
            type = r() < 0.62 ? 'LD' : (r() < 0.5 ? 'FB' : 'GB');
            ev = 94 + r() * 13; la = type === 'GB' ? -2 + r() * 8 : 10 + r() * 16;
            field = type === 'GB' ? (r() < 0.5 ? 'LF' : 'RF') : EL_FIELDS_AIR[Math.floor(r() * 5)];
        } else if (code === 'b1') {
            type = r() < 0.44 ? 'LD' : (r() < 0.72 ? 'GB' : 'FB');
            ev = 80 + r() * 20; la = type === 'GB' ? -8 + r() * 12 : (type === 'LD' ? 8 + r() * 12 : 24 + r() * 12);
            field = type === 'GB' ? EL_FIELDS_GB[Math.floor(r() * 5)] : EL_FIELDS_AIR[Math.floor(r() * 5)];
        } else { // batted-ball out / error / sac
            type = r() < 0.45 ? 'GB' : (r() < 0.72 ? 'FB' : (r() < 0.9 ? 'LD' : 'PU'));
            ev = 70 + r() * 25;
            la = type === 'GB' ? -18 + r() * 16 : (type === 'LD' ? 8 + r() * 12 : (type === 'PU' ? 55 + r() * 20 : 26 + r() * 18));
            field = type === 'GB' ? EL_FIELDS_GB[Math.floor(r() * 5)] : EL_FIELDS_AIR[Math.floor(r() * 5)];
        }
        return {
            type: type, field: field,
            ev: Math.round(ev * 10) / 10,
            la: Math.round(la),
            dist: dist
        };
    }
    // Real pitch-by-pitch sequence for one plate appearance. Walks end on ball
    // four, strikeouts end on the third strike, balls in play end on a swing,
    // fouls with two strikes extend the at-bat - so the count is always legal
    // and PC/ST are simply the length and the strike tally of this array.
    function evPitchSequence(code, isHbp, random) {
        var seq = [], b = 0, s = 0, MAX = 14;
        function add(call) {
            seq.push({ n: seq.length + 1, call: call, b: b, s: s });
            if (call === 'B') b++;
            else if (call === 'F') { if (s < 2) s++; }
            else if (call === 'CS' || call === 'SS') s++;
        }
        // `rush` forces the at-bat toward its terminal pitch once the sequence has
        // run long, so every PA ends on a legal count (ball four, strike three, or
        // a ball in play) instead of being truncated by the loop guard.
        while (true) {
            var rush = seq.length >= MAX;
            var call;
            if (isHbp) {
                // Hit by pitch: an ordinary count, then the pitch that gets him.
                if (rush || b === 3 || (seq.length >= 1 && random() < 0.42)) { add('H'); break; }
                call = random() < 0.52 ? 'B' : 'F';
                add(call);
            } else if (code === 'bb') {
                if (b === 3) { add('B'); break; }          // ball four ends it
                if (rush) { add('B'); continue; }
                if (s === 2) call = random() < 0.42 ? 'B' : 'F';
                else call = random() < 0.68 ? 'B' : (random() < 0.50 ? 'CS' : 'F');
                add(call);
            } else if (code === 'so') {
                if (s === 2) {
                    // Two strikes: foul it off, or the at-bat ends on strike three.
                    if (!rush && random() < 0.30) { add('F'); continue; }
                    add(random() < 0.52 ? 'SS' : 'CS');
                    break;
                }
                if (b === 3 || rush) call = random() < 0.40 ? 'CS' : (random() < 0.5 ? 'SS' : 'F');
                else call = random() < 0.35 ? 'B' : (random() < 0.34 ? 'CS' : (random() < 0.46 ? 'SS' : 'F'));
                add(call);
            } else {
                // Ball in play. Target mix per pitch: 34% ball, 33% foul, 33% contact.
                if (rush) { add('X'); break; }
                if (s === 2 && random() < 0.34) { add('F'); continue; }
                if (b < 3 && random() < 0.34) { add('B'); continue; }
                if (random() < 0.50) { add('F'); continue; }
                add('X');
                break;
            }
        }
        var strikes = 0;
        for (var i = 0; i < seq.length; i++) {
            var c = seq[i].call;
            if (c === 'CS' || c === 'SS' || c === 'F' || c === 'X') strikes++;
        }
        return { pitches: seq, count: seq.length, strikes: strikes };
    }
    // =====================================================================
    // TMR_ROSTER_STATE_20260723 (Stage 3) — legal in-game roster state:
    // substitutions, injuries, ejections.
    //
    // This entire subsystem runs ONLY in the displayed (event-logged) game. The
    // 2000-game win-probability sample and the offline calibration gate call
    // evSimGame WITHOUT a log sink, so none of this fires there and the model
    // stays byte-identical (verified by the calibration gate being unchanged).
    //
    // Substitution mechanism: base runners are stored as batting-order SLOT
    // indices and lineup[slot] holds the current occupant, so a substitution is a
    // single occupant swap — a pinch hitter swaps before batting, a pinch runner
    // swaps while the slot is on base (inheriting the base), a defensive/injury/
    // ejection replacement swaps and the outgoing player is marked removed and can
    // never re-enter. Every slot keeps the full history of who occupied it
    // (lineupSlots[slot]) so the box score shows starter + subs indented.
    // =====================================================================
    var EL_INJURY = {
        // Per-event probabilities, tuned so total injuries land ≈0.25/game (≤0.35
        // cap, calibrated against real MLB in-game injury frequency). A test hook
        // scales all of these via window.__EL_INJURY_MULT for the legality fuzzer.
        perPa: 0.00080,     // swing / general
        perHbp: 0.026,      // hit by pitch — the classic in-game injury
        perSteal: 0.0060,   // sliding into a base
        perPitcherAppearance: 0.0040, // pitching motion, per arm per game
        perBip: 0.00075     // fielding / running out a batted ball
    };
    var EL_EJECT = {
        // Ejections are rarer than injuries (real MLB ≈0.05/game across everyone).
        perCloseCallPa: 0.00055,  // arguing a call, elevated in tight games
        perHbp: 0.0050,           // benches-warned / retaliation reads
        managerShare: 0.62        // share of ejections that are the manager, not a player
    };
    // Body areas drawn from a pool appropriate to how the injury happened, so an HBP
    // hurts a hand/wrist and a pitching-motion injury is an arm/shoulder — not random.
    var EL_BODY_AREAS = {
        pitch: ['left shoulder', 'right shoulder', 'left elbow', 'right elbow', 'right forearm', 'left forearm', 'lat', 'right oblique'],
        hbp: ['left hand', 'right hand', 'left wrist', 'right wrist', 'left forearm', 'right elbow', 'left foot', 'right knee'],
        run: ['left hamstring', 'right hamstring', 'left quad', 'right quad', 'left ankle', 'right ankle', 'left knee', 'right knee'],
        swing: ['left oblique', 'right oblique', 'lower back', 'left wrist', 'right wrist', 'left hand', 'right hand'],
        field: ['left ankle', 'right ankle', 'left knee', 'right knee', 'left shoulder', 'right shoulder', 'left wrist', 'lower back']
    };
    function elBodyArea(mechanism, r) {
        var pool = /hit by pitch/.test(mechanism) ? EL_BODY_AREAS.hbp
            : /pitching/.test(mechanism) ? EL_BODY_AREAS.pitch
            : /baserunning|slide|collision/.test(mechanism) ? EL_BODY_AREAS.run
            : /swing/.test(mechanism) ? EL_BODY_AREAS.swing
            : EL_BODY_AREAS.field;
        return pool[Math.floor(r() * pool.length)];
    }
    var EL_EJECT_CAUSES = ['arguing a called third strike', 'arguing a ball/strike call',
        'arguing a safe/out call at a base', 'arguing a checked-swing call',
        'arguing after a hit-by-pitch', 'continued arguing after a warning'];
    function elInjurySeverity(r) {
        // Weighted toward minor. Returns { severity, outcome, remains, missedGames, penalty }.
        var x = r();
        if (x < 0.55) return { severity: 'minor', outcome: 'evaluated and remained in the game', remains: true, missedGames: 0, penalty: 0 };
        if (x < 0.78) return { severity: 'minor', outcome: 'remained in the game with reduced effectiveness', remains: true, missedGames: 0, penalty: 0.35 };
        if (x < 0.93) return { severity: 'moderate', outcome: 'removed from the game as a precaution', remains: false, missedGames: 0, penalty: 0 };
        if (x < 0.985) return { severity: 'moderate', outcome: 'unable to continue; listed day-to-day', remains: false, missedGames: 3, penalty: 0 };
        return { severity: 'significant', outcome: 'unable to continue; expected multi-game absence', remains: false, missedGames: 15, penalty: 0 };
    }
    // Build the bench: verified non-pitchers beyond the nine starters, as full
    // batter objects ready to be swapped into a lineup slot. Empty for synthetic
    // teams (no roster) — which is exactly why the offline gate never substitutes.
    function evBuildBench(team, roster, parkHr) {
        var players = Array.isArray(roster && roster.players) ? roster.players : [];
        var pitcherRe = /^(P|SP|RP|CP|Relief|Pitcher)$/i;
        var nonPitchers = players.filter(function (p) { return p && !pitcherRe.test(String(p.position || '')); });
        var benchPlayers = nonPitchers.slice(9); // beyond the 9 starters
        return benchPlayers.map(function (p) {
            var seasonStat = p.mlbId ? cachedPlayerStat(p.mlbId, 'hitting') : null;
            var pa = seasonStat ? Number(seasonStat.plateAppearances || 0) : 0;
            var rw = clamp(pa / 250, 0.15, 1);
            var LG = { ops: 0.715, avg: 0.245, slg: 0.400, kRate: 0.225, bbRate: 0.085, hrRate: 0.033 };
            function reg(obs, lg) { return (obs == null || !Number.isFinite(obs)) ? lg : obs * rw + lg * (1 - rw); }
            var hasReal = !!(seasonStat && Number.isFinite(Number(seasonStat.ops)) && pa >= 15);
            var statObj = hasReal ? {
                real: true, ops: reg(Number(seasonStat.ops), LG.ops), avg: reg(Number(seasonStat.avg), LG.avg),
                slg: reg(Number(seasonStat.slg), LG.slg),
                kRate: reg(Number(seasonStat.strikeOuts || 0) / Math.max(1, pa), LG.kRate),
                bbRate: reg(Number(seasonStat.baseOnBalls || 0) / Math.max(1, pa), LG.bbRate),
                hrRate: reg(Number(seasonStat.homeRuns || 0) / Math.max(1, Number(seasonStat.atBats || 1)), LG.hrRate),
                ab: Number(seasonStat.atBats || 0), pa: pa
            } : null;
            var baseVec = statObj ? evBatterVector(statObj) : evSyntheticVector(team && team.offense, 7);
            var pos = playerPositionLabel(p) || 'PH';
            return {
                pid: p.mlbId ? ('id' + p.mlbId) : ('nm' + normalizeName(p.name)),
                baseVec: baseVec, baseVecVsL: baseVec, baseVecVsR: baseVec,
                playerName: p.name, name: p.name + ' (' + pos + ')', rawPos: pos,
                realAvg: hasReal ? Number(seasonStat.avg) : null,
                realOps: hasReal ? Number(seasonStat.ops) : null,
                statSource: hasReal ? ('Real ' + seasonYear() + ' season') : null,
                speed: 1.0, stealRate: 0.09, stealSuccess: 0.75,
                acc: evNewBat(), isBench: true, injuryPenalty: 0
            };
        });
    }
    // Test-only: a synthetic bench so the offline roster-legality fuzzer can force
    // substitutions (real benches only exist in-browser with live rosters). Not used
    // by the product; exposed via _engine for validate-roster-state.cjs.
    function makeSyntheticBench(prefix, n, offense) {
        var out = [];
        for (var i = 0; i < n; i++) {
            var v = evSyntheticVector(offense || 100, 6);
            out.push({
                pid: prefix + '_bench' + i,
                baseVec: v, baseVecVsL: v, baseVecVsR: v,
                playerName: prefix + ' Bench ' + (i + 1), name: prefix + ' Bench ' + (i + 1) + ' (PH)', rawPos: 'PH',
                realAvg: 0.245, realOps: 0.700, statSource: 'synthetic',
                speed: 0.95, stealRate: 0.09, stealSuccess: 0.75, acc: evNewBat(), isBench: true, injuryPenalty: 0
            });
        }
        return out;
    }
    // Apply an outcome-vector penalty to an injured-but-still-playing batter.
    function elApplyInjuryVector(v, penalty) {
        if (!penalty) return v;
        // Shift probability mass from hits toward outs; leave BB/K structure alone.
        var out = {};
        for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = v[k];
        ['b1', 'b2', 'b3', 'hr'].forEach(function (h) { if (out[h]) { out.out = (out.out || 0) + out[h] * penalty; out[h] *= (1 - penalty); } });
        return out;
    }
    function evPlayHalf(side, pitcher, random, endLead, ghostSlot, defSide, log) {
        var lineup = side.lineup, outs = 0, bases = [null, null, null], runs = 0, errors = 0;
        // SCORING_EVENT_LOG_20260703: when `log` is provided (only for the single
        // displayed game, never the win-probability samples) record each notable event
        // — HR, XBH, SB/CS, sacrifice, HBP — with the inning, batter/runner, responsible
        // pitcher, outs and RBI, so the box score can render a real play-by-play detail
        // section instead of one run-on sentence. No effect on the simulation math.
        function bname(slot) { var p = lineup[slot]; return (p && (p.playerName || String(p.name || '').replace(/\s*\([^)]*\)\s*$/, ''))) || ''; }
        function logEvent(e) { if (!log) return; e.inning = log.inning; e.half = log.half; e.team = log.teamAbbr; log.events.push(e); }
        // TMR_EVENTLOG_20260723: structured emission. `log.el` is the authoritative
        // event log; `log.events` remains the legacy scoring list so the existing
        // renderers keep working while the reducers are shadow-compared.
        var el = log && log.el ? log.el : null;
        function baseSnapshot() {
            return [
                bases[0] !== null ? bases[0] : null,
                bases[1] !== null ? bases[1] : null,
                bases[2] !== null ? bases[2] : null
            ];
        }
        function pitcherRefs() {
            return [
                bp[0] ? bp[0].name : null,
                bp[1] ? bp[1].name : null,
                bp[2] ? bp[2].name : null
            ];
        }
        function elScore(extraRuns) {
            var mine = (log ? (log.runsBefore || 0) : 0) + runs + (extraRuns || 0);
            var theirs = log ? (log.oppScore || 0) : 0;
            return log && log.battingTeam === 'home'
                ? { away: theirs, home: mine }
                : { away: mine, home: theirs };
        }
        function elEmit(type, fields) {
            if (!el) return null;
            var e = {
                eventType: type,
                inning: log.inning, half: log.half,
                battingTeam: log.battingTeam, fieldingTeam: log.battingTeam === 'home' ? 'away' : 'home',
                battingTeamAbbr: log.teamAbbr, fieldingTeamAbbr: log.defAbbr,
                pitcherId: pitcher ? pitcher.name : null
            };
            for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) e[k] = fields[k];
            return elPush(el, e);
        }
        // ---- Stage 3: in-game substitutions (batting side) -------------------
        // Swap the occupant of a batting-order slot. The base runners reference the
        // SLOT, not the player, so a runner already on base simply becomes the new
        // occupant — which is exactly a pinch runner. The outgoing player is marked
        // removed and can never legally re-enter. Returns the incoming batter.
        function elPullBench(preferPos) {
            var pool = side.bench || [];
            if (!pool.length) return null;
            // Prefer a bench player who covers the vacated position; else best OPS.
            var idx = -1;
            if (preferPos) {
                for (var i = 0; i < pool.length; i++) {
                    if (String(pool[i].rawPos || '').toUpperCase() === String(preferPos).toUpperCase()) { idx = i; break; }
                }
            }
            if (idx < 0) {
                idx = 0; var best = -1;
                pool.forEach(function (p, i) { var o = p.realOps != null ? p.realOps : 0.7; if (o > best) { best = o; idx = i; } });
            }
            return pool.splice(idx, 1)[0];
        }
        function elSwapSlot(slot, role, reason, opts) {
            if (!el || !side.bench || !side.bench.length) return null;
            var outgoing = lineup[slot];
            var incoming = (opts && opts.incoming) || elPullBench(outgoing && outgoing.rawPos);
            if (!incoming) return null;
            // Legality: never re-use a player already used or removed. Pull it back
            // out of the failed splice so the bench player is not silently lost.
            if (incoming.pid && (side.usedPids[incoming.pid] || side.removedPids[incoming.pid])) { if (side.bench.indexOf(incoming) < 0) side.bench.push(incoming); return null; }
            lineup[slot] = incoming;
            side.lineupSlots[slot].push(incoming);
            if (outgoing && outgoing.pid) { side.removedPids[outgoing.pid] = true; }
            if (incoming.pid) side.usedPids[incoming.pid] = true;
            side.subCount = (side.subCount || 0) + 1;
            var roleLabel = role === 'PH' ? 'Pinch Hitter' : role === 'PR' ? 'Pinch Runner' : role === 'INJ' ? 'Injury Replacement' : role === 'EJ' ? 'Ejection Replacement' : 'Defensive Substitution';
            elEmit(EL_TYPES.SUB, {
                subjectTeam: log.battingTeam,
                baseStateBefore: baseSnapshot(), baseStateAfter: baseSnapshot(),
                runnerPitcher: pitcherRefs(),
                outsBefore: outs, outsAfter: outs,
                scoreBefore: elScore(), scoreAfter: elScore(),
                substitutionData: {
                    out: outgoing ? (outgoing.playerName || outgoing.name) : null,
                    in: incoming.playerName || incoming.name,
                    role: role, slot: slot, position: incoming.rawPos || null, reason: reason || roleLabel
                },
                result: { code: 'SUB', detail: roleLabel + ': ' + (incoming.playerName || incoming.name) + ' replaces ' + (outgoing ? (outgoing.playerName || outgoing.name) : 'starter') + ' (batting ' + (slot + 1) + ')' + (reason ? ' — ' + reason : '') },
                runsScored: [], rbi: 0
            });
            return incoming;
        }
        // ---- Stage 3: injuries (batting side) --------------------------------
        function elMaybeInjury(slot, mechanism, baseRate) {
            if (!el) return false;
            var mult = (typeof window !== 'undefined' && Number(window.__EL_INJURY_MULT)) || 1;
            if (random() >= baseRate * mult) return false;
            var victim = lineup[slot];
            if (!victim || (victim.pid && side.removedPids[victim.pid])) return false;
            var sev = elInjurySeverity(random);
            var area = elBodyArea(mechanism, random);
            var vname = victim.playerName || victim.name;
            var replacement = null;
            if (!sev.remains) {
                var repl = elSwapSlot(slot, 'INJ', vname + ' (' + area + ')');
                replacement = repl ? (repl.playerName || repl.name) : null;
                // No bench left: the player must stay in under official rules.
                if (!repl) { sev.remains = true; sev.outcome = 'no available replacement; forced to remain in the game'; }
            } else if (sev.penalty) {
                victim.injuryPenalty = Math.max(victim.injuryPenalty || 0, sev.penalty);
            }
            var rec = {
                player: vname, team: log.teamAbbr, inning: log.inning, half: log.half,
                mechanism: mechanism, bodyArea: area, severity: sev.severity, outcome: sev.outcome,
                remains: sev.remains, missedGames: sev.missedGames, replacement: replacement, side: 'batting'
            };
            side.injuries.push(rec);
            elEmit(EL_TYPES.INJURY, {
                subjectTeam: log.battingTeam,
                batterId: vname, batterSlot: slot,
                baseStateBefore: baseSnapshot(), baseStateAfter: baseSnapshot(),
                runnerPitcher: pitcherRefs(), outsBefore: outs, outsAfter: outs,
                scoreBefore: elScore(), scoreAfter: elScore(),
                injuryData: rec,
                result: { code: 'INJURY', detail: vname + ' — ' + mechanism + '; ' + area + ' (' + sev.severity + '). ' + sev.outcome + (replacement ? '. ' + replacement + ' enters.' : '') },
                runsScored: [], rbi: 0
            });
            return !sev.remains;
        }
        // ---- Stage 3: ejections (batting side) -------------------------------
        function elMaybeEjection(slot, trigger, baseRate) {
            if (!el) return false;
            var mult = (typeof window !== 'undefined' && Number(window.__EL_EJECT_MULT)) || 1;
            if (random() >= baseRate * mult) return false;
            var isManager = random() < EL_EJECT.managerShare;
            var cause = EL_EJECT_CAUSES[Math.floor(random() * EL_EJECT_CAUSES.length)];
            if (isManager) {
                if (side.managerEjected) return false;
                side.managerEjected = true;
                var mrec = { person: (side.team && side.team.abbreviation ? side.team.abbreviation + ' manager' : 'Manager'), personType: 'manager', cause: cause, team: log.teamAbbr, inning: log.inning, half: log.half, replacement: 'bench coach assumes strategy' };
                side.ejections.push(mrec);
                elEmit(EL_TYPES.EJECTION, {
                    subjectTeam: log.battingTeam,
                    baseStateBefore: baseSnapshot(), baseStateAfter: baseSnapshot(), runnerPitcher: pitcherRefs(),
                    outsBefore: outs, outsAfter: outs, scoreBefore: elScore(), scoreAfter: elScore(),
                    ejectionData: mrec,
                    result: { code: 'EJECTION', detail: mrec.person + ' ejected — ' + cause + '. Bench coach assumes in-game strategy.' },
                    runsScored: [], rbi: 0
                });
                return false; // manager ejection does not remove a player
            }
            var victim = lineup[slot];
            if (!victim || (victim.pid && side.removedPids[victim.pid])) return false;
            var vname = victim.playerName || victim.name;
            var repl = elSwapSlot(slot, 'EJ', vname + ' ejected (' + cause + ')');
            var erec = { person: vname, personType: 'player', cause: cause, team: log.teamAbbr, inning: log.inning, half: log.half, replacement: repl ? (repl.playerName || repl.name) : null };
            side.ejections.push(erec);
            elEmit(EL_TYPES.EJECTION, {
                subjectTeam: log.battingTeam,
                batterId: vname, batterSlot: slot,
                baseStateBefore: baseSnapshot(), baseStateAfter: baseSnapshot(), runnerPitcher: pitcherRefs(),
                outsBefore: outs, outsAfter: outs, scoreBefore: elScore(), scoreAfter: elScore(),
                ejectionData: erec,
                result: { code: 'EJECTION', detail: vname + ' ejected by the umpire — ' + cause + (repl ? '. ' + (repl.playerName || repl.name) + ' enters.' : '. No replacement available.') },
                runsScored: [], rbi: 0
            });
            return !!repl;
        }
        // ---- Stage 3: pitcher injury / ejection (fielding side) --------------
        // Checked once per half-inning entry (~one appearance touch). On removal the
        // next bullpen arm enters; an ejected pitcher can never return. Bases are
        // empty at a half boundary, so there are no inherited runners to charge.
        function elMaybePitcherEvent() {
            if (!el || !defSide || !Array.isArray(defSide.pitchers)) return;
            var arms = defSide.pitchers, idx = arms.indexOf(pitcher);
            if (idx < 0 || idx >= arms.length - 1) return; // no arm available to replace him
            var injMult = (typeof window !== 'undefined' && Number(window.__EL_INJURY_MULT)) || 1;
            var ejMult = (typeof window !== 'undefined' && Number(window.__EL_EJECT_MULT)) || 1;
            var injured = random() < EL_INJURY.perPitcherAppearance * injMult;
            var ejected = !injured && random() < EL_EJECT.perCloseCallPa * 3 * ejMult;
            if (!injured && !ejected) return;
            var subjectTeam = log.battingTeam === 'home' ? 'away' : 'home';
            var outgoing = pitcher;
            var pname = String(outgoing.name).replace(/\s*\((LHP|RHP)\)$/, '');
            pitcher = arms[idx + 1];
            defSide.minArmIdx = Math.max(defSide.minArmIdx || 0, idx + 1);
            if (outgoing.pid) defSide.removedPids && (defSide.removedPids[outgoing.pid] = true);
            outgoing.removed = true;
            if (injured) {
                var sev = elInjurySeverity(random);
                var area = elBodyArea('pitching', random);
                var rec = { player: pname, team: log.defAbbr, inning: log.inning, half: log.half, mechanism: 'pitching motion', bodyArea: area, severity: sev.severity, outcome: 'removed from the game', remains: false, missedGames: sev.missedGames, replacement: String(pitcher.name).replace(/\s*\((LHP|RHP)\)$/, ''), side: 'pitching' };
                (defSide.injuries = defSide.injuries || []).push(rec);
                elEmit(EL_TYPES.INJURY, {
                    subjectTeam: subjectTeam,
                    baseStateBefore: baseSnapshot(), baseStateAfter: baseSnapshot(), runnerPitcher: pitcherRefs(),
                    outsBefore: outs, outsAfter: outs, scoreBefore: elScore(), scoreAfter: elScore(),
                    injuryData: rec,
                    result: { code: 'INJURY', detail: pname + ' (P) — pitching motion; ' + area + ' (' + sev.severity + '). Removed from the game. ' + rec.replacement + ' enters.' },
                    runsScored: [], rbi: 0
                });
            } else {
                var cause = EL_EJECT_CAUSES[Math.floor(random() * EL_EJECT_CAUSES.length)];
                var erec = { person: pname, personType: 'pitcher', cause: cause, team: log.defAbbr, inning: log.inning, half: log.half, replacement: String(pitcher.name).replace(/\s*\((LHP|RHP)\)$/, '') };
                (defSide.ejections = defSide.ejections || []).push(erec);
                elEmit(EL_TYPES.EJECTION, {
                    subjectTeam: subjectTeam,
                    baseStateBefore: baseSnapshot(), baseStateAfter: baseSnapshot(), runnerPitcher: pitcherRefs(),
                    outsBefore: outs, outsAfter: outs, scoreBefore: elScore(), scoreAfter: elScore(),
                    ejectionData: erec,
                    result: { code: 'EJECTION', detail: pname + ' (P) ejected — ' + cause + '. ' + erec.replacement + ' enters.' },
                    runsScored: [], rbi: 0
                });
            }
            elEmit(EL_TYPES.SUB, {
                subjectTeam: subjectTeam,
                baseStateBefore: baseSnapshot(), baseStateAfter: baseSnapshot(), runnerPitcher: pitcherRefs(),
                outsBefore: outs, outsAfter: outs, scoreBefore: elScore(), scoreAfter: elScore(),
                substitutionData: { out: pname, in: String(pitcher.name).replace(/\s*\((LHP|RHP)\)$/, ''), role: 'P', reason: injured ? 'injury' : 'ejection', inheritedRunners: 0, midInning: false },
                result: { code: 'PITCHING_CHANGE', detail: 'Pitching Change: ' + String(pitcher.name).replace(/\s*\((LHP|RHP)\)$/, '') + ' replaces ' + pname + ' (' + (injured ? 'injury' : 'ejection') + ')' },
                runsScored: [], rbi: 0
            });
        }
        // bp[k] = the pitcher responsible for the runner on base k (the arm that put him
        // there). Inherited runners that score charge THAT pitcher, not whoever is on the
        // mound when they cross — the correct rule once mid-inning changes exist.
        var bp = [null, null, null];
        var hasGhost = ghostSlot !== undefined && ghostSlot !== null;
        var ghostScored = false;
        if (hasGhost) { bases[1] = ghostSlot; bp[1] = pitcher; }
        var apptRuns = 0; // runs scored during the current pitcher's appearance this inning
        // Per-event run ledger: every run is recorded with the runner, whether it
        // was earned, which pitcher is charged, and whether it is an RBI. The
        // batting table, pitching table, RBI notes and play-by-play all read this
        // one ledger, so they cannot disagree.
        var evRuns = [];
        function score(slot, earned, resp, rbiCredited) {
            if (hasGhost && !ghostScored && slot === ghostSlot) { ghostScored = true; earned = false; }
            lineup[slot].acc.r++; runs++; apptRuns++;
            var rp = resp || pitcher; rp.acc.r++; if (earned) rp.acc.er++;
            // Inherited runner scored: charged to the arm that put him on, but it
            // happened on the current pitcher's watch. Both facts are recorded.
            if (rp !== pitcher && pitcher) pitcher.acc.irs = (pitcher.acc.irs || 0) + 1;
            evRuns.push({
                runnerSlot: slot, runnerId: bname(slot), earned: !!earned,
                chargedPitcherId: rp ? rp.name : null,
                rbiCredited: rbiCredited !== false,
                placed: hasGhost && slot === ghostSlot
            });
        }
        // MID_INNING_CHANGE_20260628: real managers pull a reliever (and a shelled
        // starter) mid-inning when the crooked number grows. The engine otherwise only
        // changes arms between innings, leaving relievers with no partial innings and too
        // few pitchers used in rough games. Walk the same bridge->setup->closer sequence
        // evActivePitcher uses; the next arm inherits the runners (charged to the arm that
        // allowed them via bp). Fires only on real damage, so run totals stay calibrated.
        function maybeChange() {
            if (!defSide || !Array.isArray(defSide.pitchers)) return;
            var arms = defSide.pitchers, idx = arms.indexOf(pitcher);
            if (idx < 0 || idx >= arms.length - 1) return;
            var threshold = idx === 0 ? 5 : 3; // shelled starter: 5 runs; reliever: 3
            if (apptRuns >= threshold) {
                var outgoing = pitcher;
                pitcher = arms[idx + 1]; apptRuns = 0; defSide.minArmIdx = Math.max(defSide.minArmIdx || 0, idx + 1); defSide.midChanges = (defSide.midChanges || 0) + 1;
                // The incoming arm inherits whoever is on base; bp[] already charges
                // those runners to the pitcher who put them there.
                var inheritedCount = bases.filter(function (x) { return x !== null; }).length;
                pitcher.acc.ir = (pitcher.acc.ir || 0) + inheritedCount;
                pitcher._inheritedSlots = bases.slice();
                elEmit(EL_TYPES.SUB, {
                    baseStateBefore: baseSnapshot(), baseStateAfter: baseSnapshot(),
                    runnerPitcher: pitcherRefs(),
                    outsBefore: outs, outsAfter: outs,
                    scoreBefore: elScore(), scoreAfter: elScore(),
                    substitutionData: { out: outgoing.name, in: pitcher.name, role: 'P', reason: 'pitching change', inheritedRunners: inheritedCount, midInning: true },
                    result: { code: 'PITCHING_CHANGE', detail: 'Pitching Change: ' + pitcher.name + ' replaces ' + outgoing.name + (inheritedCount ? ' with ' + inheritedCount + ' on base' : '') },
                    runsScored: [], rbi: 0
                });
            }
        }
        var gidp = 0, ofAssists = 0;
        // Stage 3: one pitcher injury/ejection check as the arm takes the mound.
        if (el) elMaybePitcherEvent();
        while (outs < 3) {
            // Pickoff: rare live event with a runner on 1B (real MLB ~0.05/team-game).
            if (bases[0] !== null && random() < 0.0035) {
                var poBefore = baseSnapshot(), poRunner = bname(bases[0]);
                side.pickoffs = (side.pickoffs || 0) + 1; bases[0] = null; bp[0] = null; pitcher.acc.outs++; outs++;
                elEmit(EL_TYPES.PICKOFF, {
                    runnerId: poRunner, base: '1st',
                    baseStateBefore: poBefore, baseStateAfter: baseSnapshot(),
                    runnerPitcher: pitcherRefs(),
                    outsBefore: outs - 1, outsAfter: outs,
                    scoreBefore: elScore(), scoreAfter: elScore(),
                    result: { code: 'PO', detail: poRunner + ' picked off first base' },
                    runsScored: [], rbi: 0
                });
                if (outs >= 3) break;
            }
            // Steal attempt with a runner on 1B and 2B open (live event, not post-hoc).
            // Per-runner rate/success (real SB profile) when available, else team default.
            var runner0 = lineup[bases[0]];
            var rSteal = runner0 && runner0.stealRate != null ? runner0.stealRate : side.stealRate;
            var rSucc = runner0 && runner0.stealSuccess != null ? runner0.stealSuccess : side.stealSuccess;
            if (bases[0] !== null && bases[1] === null && random() < rSteal) {
                var stealerSlot = bases[0];
                var stealerName = bname(bases[0]);
                var stBefore = baseSnapshot(), stOuts = outs;
                if (random() < rSucc) { lineup[bases[0]].acc.sb++; side.sb++; logEvent({ type: 'SB', runner: stealerName, pitcher: pitcher.name, base: '2nd' }); bases[1] = bases[0]; bp[1] = bp[0]; bases[0] = null; bp[0] = null; }
                else { lineup[bases[0]].acc.cs++; side.cs++; logEvent({ type: 'CS', runner: stealerName, pitcher: pitcher.name, base: '2nd' }); bases[0] = null; bp[0] = null; pitcher.acc.outs++; outs++; }
                elEmit(EL_TYPES.STEAL, {
                    runnerId: stealerName, runnerSlot: stealerSlot, base: '2nd', safe: outs === stOuts,
                    baseStateBefore: stBefore, baseStateAfter: baseSnapshot(),
                    runnerPitcher: pitcherRefs(),
                    outsBefore: stOuts, outsAfter: outs,
                    scoreBefore: elScore(), scoreAfter: elScore(),
                    result: {
                        code: outs === stOuts ? 'SB' : 'CS',
                        detail: stealerName + (outs === stOuts ? ' steals second base' : ' caught stealing second base')
                    },
                    runsScored: [], rbi: 0
                });
                if (outs >= 3) break;
            }
            var bi = side.idx % 9, b = lineup[bi];
            // Stage 3 strategic pinch hitter: late innings, a clearly weak bat due up,
            // bench available. Displayed game only (el present) so calibration is
            // untouched. Emits a SUB and the pinch hitter takes the at-bat.
            if (el && log.inning >= 7 && side.bench && side.bench.length && b && b.realOps != null && b.realOps < 0.660 && random() < 0.06) {
                var ph = elSwapSlot(bi, 'PH', 'strategic move');
                if (ph) b = lineup[bi];
            }
            // INTENTIONAL_WALK_20260629: first base open, a runner in scoring position,
            // two outs, an elite bat up and a clearly weaker on-deck hitter -> the manager
            // puts him on (real MLB ~0.2 IBB/team-game). Needs real OPS, so synthetic teams
            // and the offline calibration harness never trigger it (calibration-neutral).
            if (bases[0] === null && (bases[1] !== null || bases[2] !== null) && outs >= 1 && b.realOps != null && b.realOps >= 0.830) {
                var onDeck = lineup[(side.idx + 1) % 9];
                var ibbProb = outs === 2 ? 0.85 : 0.30;
                if (onDeck && (onDeck.realOps == null || onDeck.realOps < b.realOps - 0.070) && random() < ibbProb) {
                    var ibbBefore = baseSnapshot(), ibbName = bname(bi);
                    b.acc.pa++; b.acc.bb++; b.acc.ibb = (b.acc.ibb || 0) + 1; pitcher.acc.bb++; pitcher.acc.bf++;
                    pitcher.acc.ibb = (pitcher.acc.ibb || 0) + 1;
                    // Automatic intentional walk (2017 rule): no pitches are thrown,
                    // so none are added to the pitch log or the pitch count.
                    bases[0] = bi; bp[0] = pitcher; side.ibb = (side.ibb || 0) + 1; side.idx++;
                    elEmit(EL_TYPES.PA, {
                        batterId: ibbName, batterSlot: bi,
                        baseStateBefore: ibbBefore, baseStateAfter: baseSnapshot(),
                        runnerPitcher: pitcherRefs(),
                        outsBefore: outs, outsAfter: outs,
                        scoreBefore: elScore(), scoreAfter: elScore(),
                        result: { code: 'IBB', detail: ibbName + ' intentionally walked' },
                        pitches: [], runsScored: [], rbi: 0
                    });
                    if (outs < 3) maybeChange();
                    continue;
                }
            }
            var timesThrough = Math.floor(pitcher.acc.bf / 9) + 1;
            // PLATOON_VS_RELIEVER_20260623: face the batter with the split that matches
            // the ACTIVE pitcher's hand (starter or reliever). baseVecVsL/R default to
            // baseVec when no real split exists, and pitcher.hand is null for synthetic
            // teams, so this is a no-op everywhere except real rosters with split data.
            var batVec = pitcher.hand === 'L' ? (b.baseVecVsL || b.baseVec)
                       : pitcher.hand === 'R' ? (b.baseVecVsR || b.baseVec)
                       : b.baseVec;
            // Stage 3: an injured-but-still-playing batter hits with reduced power.
            // injuryPenalty is 0 outside the displayed game, so this is a no-op for
            // the calibration path.
            if (b.injuryPenalty) batVec = elApplyInjuryVector(batVec, b.injuryPenalty);
            var v = evScale(evApplyTto(evApplyParkHr(evCombine(batVec, pitcher.vec), side.parkHr), evTtoMultipliers(timesThrough)), side.anchorFactor);
            var ev = evSample(v, random), acc = b.acc; acc.pa++; pitcher.acc.bf++;
            // Event-sourced situational accounting (no post-hoc estimates):
            var paBefore = baseSnapshot(), paName = bname(bi), paRunnerPitchers = pitcherRefs();
            var paIsHbp = false, paErrorReach = false, paSf = false, paSac = false, paGidp = false, paOfAssist = false;
            evRuns = [];
            var preOuts = outs;
            var rispAtBat = bases[1] !== null || bases[2] !== null;
            var runnersOnBefore = (bases[0] !== null ? 1 : 0) + (bases[1] !== null ? 1 : 0) + (bases[2] !== null ? 1 : 0);
            var abBefore = acc.ab, hBefore = acc.h;
            var rbi = 0;
            if (ev === 'bb') {
                // A share of free passes are hit-by-pitch: same base state, but tracked
                // and displayed as HBP instead of a walk (calibration-neutral).
                if (random() < EV_HBP_SHARE) { paIsHbp = true; acc.hbp = (acc.hbp || 0) + 1; side.hbp = (side.hbp || 0) + 1; pitcher.acc.hbp = (pitcher.acc.hbp || 0) + 1; logEvent({ type: 'HBP', batter: bname(bi), pitcher: pitcher.name }); }
                else { acc.bb++; pitcher.acc.bb++; }
                if (bases[0] !== null) { if (bases[1] !== null) { if (bases[2] !== null) { score(bases[2], true, bp[2]); rbi++; } bases[2] = bases[1]; bp[2] = bp[1]; } bases[1] = bases[0]; bp[1] = bp[0]; }
                bases[0] = bi; bp[0] = pitcher;
            } else if (ev === 'so') { acc.ab++; acc.so++; pitcher.acc.so++; pitcher.acc.outs++; outs++;
            } else if (ev === 'hr') {
                acc.ab++; acc.h++; acc.hr++; pitcher.acc.h++; pitcher.acc.hr++;
                for (var k = 0; k < 3; k++) { if (bases[k] !== null) { score(bases[k], true, bp[k]); rbi++; bases[k] = null; bp[k] = null; } }
                score(bi, true, pitcher); rbi++;
            } else if (ev === 'b3') {
                acc.ab++; acc.h++; acc.b3++; pitcher.acc.h++;
                for (var k2 = 0; k2 < 3; k2++) { if (bases[k2] !== null) { score(bases[k2], true, bp[k2]); rbi++; bases[k2] = null; bp[k2] = null; } }
                bases[2] = bi; bp[2] = pitcher;
            } else if (ev === 'b2') {
                acc.ab++; acc.h++; acc.b2++; pitcher.acc.h++;
                if (bases[2] !== null) { score(bases[2], true, bp[2]); rbi++; bases[2] = null; bp[2] = null; }
                if (bases[1] !== null) { score(bases[1], true, bp[1]); rbi++; bases[1] = null; bp[1] = null; }
                if (bases[0] !== null) { if (random() < clamp(0.40 * (lineup[bases[0]].speed || 1), 0.18, 0.72)) { score(bases[0], true, bp[0]); rbi++; } else { bases[2] = bases[0]; bp[2] = bp[0]; } bases[0] = null; bp[0] = null; }
                bases[1] = bi; bp[1] = pitcher;
            } else if (ev === 'b1') {
                acc.ab++; acc.h++; acc.b1 = (acc.b1 || 0) + 1; pitcher.acc.h++;
                if (bases[2] !== null) { score(bases[2], true, bp[2]); rbi++; bases[2] = null; bp[2] = null; }
                if (bases[1] !== null) {
                    var sp2 = lineup[bases[1]].speed || 1;
                    var scoreT = clamp(0.60 * sp2, 0.42, 0.82), outT = scoreT + 0.10;
                    var send = random();
                    if (send < scoreT) { score(bases[1], true, bp[1]); rbi++; bases[1] = null; bp[1] = null; }
                    else if (send < outT) { ofAssists++; paOfAssist = true; pitcher.acc.outs++; outs++; bases[1] = null; bp[1] = null; } // thrown out at home (outfield assist)
                    else { bases[2] = bases[1]; bp[2] = bp[1]; bases[1] = null; bp[1] = null; }
                }
                if (bases[0] !== null) { if (random() < clamp(0.28 * (lineup[bases[0]].speed || 1), 0.12, 0.5) && bases[2] === null) { bases[2] = bases[0]; bp[2] = bp[0]; } else { bases[1] = bases[0]; bp[1] = bp[0]; } bases[0] = null; bp[0] = null; }
                bases[0] = bi; bp[0] = pitcher;
            } else { // out in play, with a small chance of a reach-on-error (unearned)
                if (random() < side.errRate) {
                    errors++; paErrorReach = true; // batter reaches as if a single but no hit, runs charged unearned
                    // A run that scores on an error is NOT an RBI (official scoring).
                    if (bases[2] !== null) { score(bases[2], false, bp[2], false); bases[2] = null; bp[2] = null; }
                    if (bases[1] !== null) { bases[2] = bases[1]; bp[2] = bp[1]; bases[1] = null; bp[1] = null; }
                    if (bases[0] !== null) { bases[1] = bases[0]; bp[1] = bp[0]; }
                    bases[0] = bi; bp[0] = pitcher; acc.ab++;
                } else {
                    acc.ab++; pitcher.acc.outs++;
                    if (outs < 2 && bases[2] !== null && random() < 0.25) {
                        // Sac fly: run scores, batter is NOT charged an at-bat (official scoring).
                        acc.ab--; acc.sf = (acc.sf || 0) + 1; side.sf = (side.sf || 0) + 1; paSf = true;
                        score(bases[2], true, bp[2]); rbi++; bases[2] = null; bp[2] = null; outs++;
                        logEvent({ type: 'SF', batter: bname(bi), pitcher: pitcher.name, rbi: 1 });
                    }
                    else if (outs < 2 && bases[2] === null && (bases[1] !== null || bases[0] !== null) && (b.realOps == null || b.realOps < 0.680) && random() < 0.026) {
                        // SAC_BUNT_20260703: weak hitter, <2 outs, a runner to advance and
                        // third base open -> lay one down. Batter out (no AB, official
                        // scoring), the lead runner(s) move up one base, no run scores, so
                        // the run environment is essentially unchanged (calibration-safe).
                        acc.ab--; acc.sac = (acc.sac || 0) + 1; side.sacBunts = (side.sacBunts || 0) + 1; paSac = true;
                        if (bases[1] !== null) { bases[2] = bases[1]; bp[2] = bp[1]; bases[1] = null; bp[1] = null; }
                        if (bases[0] !== null) { bases[1] = bases[0]; bp[1] = bp[0]; bases[0] = null; bp[0] = null; }
                        outs++;
                        logEvent({ type: 'SAC', batter: bname(bi), pitcher: pitcher.name });
                    }
                    else if (outs < 2 && bases[0] !== null && random() < 0.21) {
                        // GIDP rate calibrated June 4 2026: 0.11 produced 0.38/team
                        // vs real 0.72; 0.21 lands on the real rate.
                        acc.gidp = (acc.gidp || 0) + 1; side.gidp = (side.gidp || 0) + 1; gidp++; paGidp = true;
                        outs += 2; pitcher.acc.outs++; bases[0] = null; bp[0] = null;
                    }
                    else outs++;
                }
            }
            // Event log for extra-base hits (SB/CS/SF/SAC/HBP already recorded inline).
            if (log) {
                if (ev === 'hr') logEvent({ type: 'HR', batter: bname(bi), pitcher: pitcher.name, outs: preOuts, runners: runnersOnBefore, rbi: rbi });
                else if (ev === 'b3') logEvent({ type: '3B', batter: bname(bi), pitcher: pitcher.name, rbi: rbi });
                else if (ev === 'b2') logEvent({ type: '2B', batter: bname(bi), pitcher: pitcher.name, rbi: rbi });
            }
            // TMR_EVENTLOG_20260723: a real pitch-by-pitch sequence replaces the old
            // sampled pitch count. Pitch count and strike count are now the length
            // and strike tally of an actual legal ball/strike progression, so the
            // pitch log and the box score cannot disagree.
            var paSeq = evPitchSequence(ev, paIsHbp, random);
            pitcher.acc.pitches = (pitcher.acc.pitches || 0) + paSeq.count;
            pitcher.acc.strikes = (pitcher.acc.strikes || 0) + paSeq.strikes;
            if (paSeq.pitches.length && paSeq.pitches[0].call !== 'B') pitcher.acc.fps = (pitcher.acc.fps || 0) + 1;
            for (var pz = 0; pz < paSeq.pitches.length; pz++) if (paSeq.pitches[pz].call === 'SS') pitcher.acc.whiff = (pitcher.acc.whiff || 0) + 1;
            if (el) {
                var paCode = ev === 'bb' ? (paIsHbp ? 'HBP' : 'BB')
                    : ev === 'so' ? 'K'
                    : ev === 'hr' ? 'HR' : ev === 'b3' ? '3B' : ev === 'b2' ? '2B' : ev === 'b1' ? '1B'
                    : paErrorReach ? 'E' : paSf ? 'SF' : paSac ? 'SH' : paGidp ? 'GIDP' : 'OUT';
                var isBip = paCode !== 'BB' && paCode !== 'HBP' && paCode !== 'K';
                var bipDetail = isBip ? elBattedBall(ev, elHashSeed(el.gameId, el.seq + 1, bi, preOuts)) : null;
                if (paCode === 'HR' && bipDetail) { paSeq.pitches[paSeq.pitches.length - 1].hr = true; }
                elEmit(EL_TYPES.PA, {
                    batterId: paName, batterSlot: bi,
                    fieldersInvolved: bipDetail ? [{ pos: bipDetail.field, role: paErrorReach ? 'error' : (paCode === 'OUT' || paCode === 'GIDP' || paCode === 'SF' || paCode === 'SH' ? 'putout' : 'fielded') }] : [],
                    baseStateBefore: paBefore, baseStateAfter: baseSnapshot(),
                    runnerPitcher: paRunnerPitchers,
                    outsBefore: preOuts, outsAfter: outs,
                    scoreBefore: elScore(-evRuns.length),
                    scoreAfter: elScore(),
                    result: {
                        code: paCode,
                        bip: bipDetail,
                        ofAssist: paOfAssist,
                        detail: elDescribePa(paCode, paName, pitcher && pitcher.name, bipDetail, evRuns, outs, paOfAssist)
                    },
                    pitches: paSeq.pitches,
                    runsScored: evRuns.slice(),
                    rbi: rbi
                });
            }
            // RISP: official team line counts at-bats with runners in scoring position.
            if (rispAtBat && acc.ab > abBefore) {
                side.rispAb = (side.rispAb || 0) + 1;
                if (acc.h > hBefore) side.rispHits = (side.rispHits || 0) + 1;
            }
            if (preOuts === 2 && rbi > 0) side.twoOutRbi = (side.twoOutRbi || 0) + rbi;
            acc.rbi += rbi;
            side.idx++;
            // Walk-off: the game ends the moment the batting side takes the lead.
            if (endLead !== undefined && endLead !== null && runs > endLead) break;
            // Stage 3: injury / ejection / strategic pinch runner after the PA
            // (displayed game only). A hit-by-pitch carries the highest injury risk.
            if (el) {
                var reached = bases.indexOf(bi) >= 0 || paErrorReach;
                var mech = paIsHbp ? 'hit by pitch' : (reached ? 'baserunning collision/slide' : (ev === 'so' || ev === 'bb' ? 'swing/plate appearance' : 'fielding a batted ball'));
                var iRate = paIsHbp ? EL_INJURY.perHbp : (reached ? EL_INJURY.perBip : EL_INJURY.perPa);
                var removed = elMaybeInjury(bi, mech, iRate);
                if (!removed) {
                    if (ev === 'so') removed = elMaybeEjection(bi, 'called strike three', EL_EJECT.perCloseCallPa);
                    else if (paIsHbp) removed = elMaybeEjection(bi, 'hit by pitch', EL_EJECT.perHbp);
                }
                if (!removed && reached && log.inning >= 8 && side.bench && side.bench.length && (b.speed || 1) < 1.0 && random() < 0.03) {
                    elSwapSlot(bi, 'PR', 'strategic move');
                }
            }
            if (outs < 3) maybeChange();
        }
        // Runners stranded in scoring position when the 3rd out was recorded.
        if (outs >= 3) {
            side.lisp2out = (side.lisp2out || 0) + (bases[1] !== null ? 1 : 0) + (bases[2] !== null ? 1 : 0);
            // MLB_BOXSCORE_LOB_20260623: charge the batter who made the inning-ending
            // out with the runners stranded on base (per-batter LOB, as on mlb.com).
            lineup[bi].acc.lob = (lineup[bi].acc.lob || 0) + bases.filter(function (x) { return x !== null; }).length;
        }
        var stranded = bases.filter(function (x) { return x !== null; }).length;
        side.lob = (side.lob || 0) + stranded;
        elEmit(EL_TYPES.INNING_END, {
            baseStateBefore: baseSnapshot(), baseStateAfter: [null, null, null],
            runnerPitcher: pitcherRefs(),
            outsBefore: outs, outsAfter: 0,
            scoreBefore: elScore(), scoreAfter: elScore(),
            result: { code: 'INNING_END', detail: 'End of the ' + (log ? log.half : '') + ' of the inning' },
            lob: stranded, runsThisHalf: runs, runsScored: [], rbi: 0
        });
        return { runs: runs, errors: errors, gidp: gidp, ofAssists: ofAssists, lob: stranded };
    }
    function evActivePitcher(side, outsRecorded) {
        // starterOutsGame: per-game sampled hook point (real starters do not throw
        // an identical inning count every outing); falls back to the season mean.
        var starterOuts = side.starterOutsGame || side.starterOuts;
        var arms = side.pitchers;
        if (arms.length <= 1) return arms[0];
        // minArmIdx floors the selection: once a mid-inning change has advanced to a later
        // arm, the next inning never reverts to an earlier one (no using the closer in the
        // 6th then the setup man in the 7th).
        var floor = side.minArmIdx || 0;
        function pick(i) { return arms[Math.max(i, floor)]; }
        // Multi-arm sequencing: the LAST arm is the closer, reserved for the 9th-
        // inning pocket (defensive out 24+) and any later relief. The middle arms
        // (bridge, setup) split the outs between the starter's exit and the 9th, in
        // order, so the highest-leverage arm (setup) covers the latest pocket.
        var closerIdx = arms.length - 1;
        var CLOSER_FLOOR = 24; // 9th inning begins at the 24th defensive out
        if (outsRecorded < starterOuts) return pick(0);
        if (outsRecorded >= Math.max(starterOuts, CLOSER_FLOOR)) return pick(closerIdx);
        var midCount = closerIdx - 1; // arms between the starter and the closer
        if (midCount <= 0) return pick(closerIdx);
        var span = CLOSER_FLOOR - starterOuts;
        if (span <= 0) return pick(closerIdx);
        var k = clamp(Math.floor(((outsRecorded - starterOuts) / span) * midCount), 0, midCount - 1);
        return pick(1 + k);
    }
    // A position player on the mound: real teams down big late send a hitter out to
    // soak innings and save the bullpen. Lobs strikes -> almost no strikeouts, lots of
    // contact, the occasional long ball. Built from one of the defending side's own
    // hitters (a corner IF / DH, the usual volunteers).
    var POSITION_PITCHER_VEC = { so: 0.045, bb: 0.075, hr: 0.050, hitFactor: 1.22 };
    function evMakePositionPitcher(side) {
        var lineup = side.lineup || [];
        var cand = lineup.filter(function (b) { return /1B|3B|2B|DH|SS|C\b/i.test(String(b.rawPos || '')); });
        var pick = cand.length ? cand[cand.length - 1] : lineup[lineup.length - 1];
        if (!pick) return null;
        var nm = (pick.playerName || pick.name || 'Position player').replace(/\s*\([^)]*\)\s*$/, '');
        return { name: nm + ' (' + (pick.rawPos || 'IF') + ', position player)', vec: POSITION_PITCHER_VEC, acc: evNewPit(), role: 'POS', hand: null, isPositionPlayer: true };
    }
    // POSITION_PLAYER_PITCHING_20260629: pick the defending arm, but in a deep blowout
    // (down 8+ in the 8th inning or later) send a position player instead of burning a
    // real reliever. The pos pitcher is appended once and pinned via minArmIdx; the
    // per-game reset truncates it so win-probability resampling never accumulates arms.
    function evDefPitcher(side, outsRecorded, defRuns, oppRuns, inn) {
        if (inn >= 7 && (oppRuns - defRuns) >= 8) {
            if (!side.posPitcher) {
                var pp = evMakePositionPitcher(side);
                if (pp) { side.pitchers.push(pp); side.posPitcherIdx = side.pitchers.length - 1; side.posPitcher = pp; }
            }
            if (side.posPitcher) { side.minArmIdx = side.posPitcherIdx; return side.posPitcher; }
        }
        return evActivePitcher(side, outsRecorded);
    }
    function evSimGame(awaySide, homeSide, random, logSink) {
        [awaySide, homeSide].forEach(function (s) {
            // Restore the pitcher staff to its real arms (drop any blowout position
            // player appended in a prior sampled game) so resampling never accumulates.
            if (s._baseArms === undefined) s._baseArms = s.pitchers.length;
            else if (s.pitchers.length > s._baseArms) s.pitchers.length = s._baseArms;
            s.posPitcher = null; s.posPitcherIdx = -1;
            s.idx = 0; s.lob = 0; s.sb = 0; s.cs = 0; s.minArmIdx = 0; s.midChanges = 0; s.ibb = 0;
            // Event-sourced situational trackers (reset per game).
            s.gidp = 0; s.sf = 0; s.sacBunts = 0; s.hbp = 0; s.rispAb = 0; s.rispHits = 0; s.twoOutRbi = 0;
            s.lisp2out = 0; s.pickoffs = 0; s.ofAssists = 0; s.dpTurned = 0; s._lastPitcher = null;
            // TMR_ROSTER_STATE_20260723: reset the in-game roster state. lineupSlots[k]
            // is the ordered history of who has occupied batting slot k (starter first).
            // These are cheap no-ops for synthetic teams (empty bench) and are only
            // mutated when a game is being event-logged.
            // Restore the ORIGINAL starting nine before each game. Substitutions in a
            // prior displayed game replaced lineup[slot] with bench players; without
            // this the lineup (and usedPids) would carry those subs into the next game.
            if (!s._starters) s._starters = s.lineup.slice();
            else s.lineup = s._starters.slice();
            s.lineupSlots = s.lineup.map(function (b) { b.isBench = false; b.injuryPenalty = 0; return [b]; });
            s.bench = (s.benchPool || []).slice();
            s.bench.forEach(function (b) { b.acc = evNewBat(); b.injuryPenalty = 0; });
            s.removedPids = {};
            s.usedPids = {};
            s.lineup.forEach(function (b) { if (b.pid) s.usedPids[b.pid] = true; });
            s.injuries = [];
            s.ejections = [];
            s.managerEjected = false;
            s.subCount = 0;
            // Per-game starter length: symmetric +/-8 out sample around the starter's
            // real per-start mean (mean-preserving). Pitching changes happen at inning
            // boundaries, so realized outings quantize to whole innings (4-8 IP range,
            // like real starters); bullpen share stays anchored on average.
            // STARTER_IP_VARIANCE_20260628: triangular (mean of two uniforms) so per-game
            // length clusters near the starter's real average (real start IP SD ~1.5),
            // instead of the old flat +/-8-out swing that produced too many 3-IP and
            // 8-IP outings. Mean-preserving; floor lifted off 8 so quick hooks stay rare.
            s.starterOutsGame = clamp(s.starterOuts + Math.round((random() + random() - 1) * 6), 9, 24);
            s.lineup.forEach(function (b) { b.acc = evNewBat(); });
            s.pitchers.forEach(function (p) { p.acc = evNewPit(); });
        });
        var aRuns = 0, hRuns = 0, aErr = 0, hErr = 0, aInn = [], hInn = [], aPlaced = 0, hPlaced = 0, walkOff = false;
        // Defensive stats (double plays turned, outfield assists) credit the side in
        // the field for that half.
        // logSink accepts the legacy scoring array or { scoring, el } where `el` is
        // the authoritative structured event log (elNewLog).
        var sinkScoring = Array.isArray(logSink) ? logSink : (logSink && logSink.scoring) || null;
        var sinkEl = (logSink && !Array.isArray(logSink) && logSink.el) || null;
        function half(batSide, defSide, pitcher, endLead, ghostSlot, inning, halfLabel) {
            var isHomeBat = batSide === homeSide;
            var log = (sinkScoring || sinkEl) ? {
                events: sinkScoring || [], el: sinkEl,
                inning: inning, half: halfLabel,
                teamAbbr: (batSide.team && batSide.team.abbreviation) || '',
                defAbbr: (defSide.team && defSide.team.abbreviation) || '',
                battingTeam: isHomeBat ? 'home' : 'away',
                runsBefore: isHomeBat ? hRuns : aRuns,
                oppScore: isHomeBat ? aRuns : hRuns
            } : null;
            if (sinkEl) {
                elPush(sinkEl, {
                    eventType: EL_TYPES.INNING_START, inning: inning, half: halfLabel,
                    battingTeam: log.battingTeam, fieldingTeam: isHomeBat ? 'away' : 'home',
                    battingTeamAbbr: log.teamAbbr, fieldingTeamAbbr: log.defAbbr,
                    pitcherId: pitcher ? pitcher.name : null,
                    baseStateBefore: [null, null, null], baseStateAfter: [null, null, null],
                    outsBefore: 0, outsAfter: 0,
                    scoreBefore: { away: aRuns, home: hRuns }, scoreAfter: { away: aRuns, home: hRuns },
                    result: { code: 'INNING_START', detail: (halfLabel === 'bottom' ? 'Bottom' : 'Top') + ' ' + inning + ' — ' + (pitcher ? pitcher.name + ' pitching' : '') },
                    runsScored: [], rbi: 0
                });
            }
            if (sinkEl && defSide._lastPitcher && defSide._lastPitcher !== pitcher) {
                elPush(sinkEl, {
                    eventType: EL_TYPES.SUB, inning: inning, half: halfLabel,
                    battingTeam: log.battingTeam, fieldingTeam: isHomeBat ? 'away' : 'home',
                    battingTeamAbbr: log.teamAbbr, fieldingTeamAbbr: log.defAbbr,
                    pitcherId: pitcher ? pitcher.name : null,
                    baseStateBefore: [null, null, null], baseStateAfter: [null, null, null],
                    outsBefore: 0, outsAfter: 0,
                    scoreBefore: { away: aRuns, home: hRuns }, scoreAfter: { away: aRuns, home: hRuns },
                    substitutionData: { out: defSide._lastPitcher.name, in: pitcher.name, role: 'P', reason: 'pitching change', inheritedRunners: 0, midInning: false },
                    result: { code: 'PITCHING_CHANGE', detail: 'Pitching Change: ' + pitcher.name + ' replaces ' + defSide._lastPitcher.name },
                    runsScored: [], rbi: 0
                });
            }
            var r = evPlayHalf(batSide, pitcher, random, endLead, ghostSlot, defSide, log);
            defSide.dpTurned += r.gidp; defSide.ofAssists += r.ofAssists;
            // Track the arm that FINISHED the half (mid-inning changes move it on),
            // so the next half only reports a change when one really happened.
            defSide._lastPitcher = defSide.pitchers.filter(function (p) { return p.acc.outs > 0 || p.acc.bf > 0; }).slice(-1)[0] || pitcher;
            return r;
        }
        for (var inn = 0; inn < 9; inn++) {
            var ap = evDefPitcher(homeSide, sumOuts(homeSide), hRuns, aRuns, inn);
            var ra = half(awaySide, homeSide, ap, null, undefined, inn + 1, 'top'); aRuns += ra.runs; hErr += ra.errors; aInn.push(ra.runs);
            if (inn === 8 && hRuns > aRuns) { break; } // home leads, bottom 9 not played
            var hp = evDefPitcher(awaySide, sumOuts(awaySide), aRuns, hRuns, inn);
            // Bottom 9: walk-off rule applies (half ends when home takes the lead).
            var hBefore = hRuns;
            var rh = half(homeSide, awaySide, hp, inn === 8 ? (aRuns - hRuns) : null, undefined, inn + 1, 'bottom');
            hRuns += rh.runs; aErr += rh.errors; hInn.push(rh.runs);
            // A walk-off is the game ENDING on the home team taking the lead in the
            // 9th or later - not any late go-ahead rally.
            if (inn === 8 && hBefore <= aRuns && hRuns > aRuns) walkOff = true;
        }
        // Extra innings: real per-inning tracking, placed runner on 2B (2020+ rule),
        // walk-off termination for the home half.
        var extra = 9;
        while (aRuns === hRuns && extra < 18) {
            // evDefPitcher (not evActivePitcher): extra innings must keep the same
            // blowout position-player-pitching rule the regulation loop uses.
            var ap2 = evDefPitcher(homeSide, sumOuts(homeSide), hRuns, aRuns, extra);
            var rae = half(awaySide, homeSide, ap2, null, (awaySide.idx + 8) % 9, extra + 1, 'top');
            aRuns += rae.runs; hErr += rae.errors; aInn.push(rae.runs); aPlaced++;
            var hp2 = evDefPitcher(awaySide, sumOuts(awaySide), aRuns, hRuns, extra);
            var hBeforeX = hRuns;
            var rhe = half(homeSide, awaySide, hp2, aRuns - hRuns, (homeSide.idx + 8) % 9, extra + 1, 'bottom');
            hRuns += rhe.runs; aErr += rhe.errors; hInn.push(rhe.runs); hPlaced++;
            if (hBeforeX <= aRuns && hRuns > aRuns) walkOff = true;
            extra++;
        }
        if (sinkEl) {
            elPush(sinkEl, {
                eventType: EL_TYPES.GAME_END, inning: extra, half: 'final',
                battingTeam: null, fieldingTeam: null,
                baseStateBefore: [null, null, null], baseStateAfter: [null, null, null],
                outsBefore: 0, outsAfter: 0,
                scoreBefore: { away: aRuns, home: hRuns }, scoreAfter: { away: aRuns, home: hRuns },
                result: { code: 'FINAL', detail: 'Final: ' + aRuns + '-' + hRuns + (extra > 9 ? ' (' + extra + ' innings)' : '') },
                runsScored: [], rbi: 0
            });
            sinkEl.final = { away: aRuns, home: hRuns, innings: extra };
        }
        return { aRuns: aRuns, hRuns: hRuns, aInn: aInn, hInn: hInn, aErr: aErr, hErr: hErr, extra: extra, aPlaced: aPlaced, hPlaced: hPlaced, walkOff: walkOff };
    }
    function sumOuts(side) { return side.pitchers.reduce(function (t, p) { return t + p.acc.outs; }, 0); }

    function buildBoxScore(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, awayWin, homeWin, seedSalt, allowUpset, rosterContext, eventInputs) {
        var random = Math.random;
        var inputs = eventInputs || buildEventInputs(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, rosterContext);
        return assembleEventBoxScore(inputs, away, home, awayPitcher, homePitcher, random);
    }
    function buildEventInputs(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, rosterContext) {
        var parkHr = parkHrFactor(home); // both clubs hit in the home park
        var awaySide = evBuildSide(away, homePitcher, awayPitcher, awayRuns, rosterContext && rosterContext.away, parkHr);
        var homeSide = evBuildSide(home, awayPitcher, homePitcher, homeRuns, rosterContext && rosterContext.home, parkHr);
        return { awaySide: awaySide, homeSide: homeSide };
    }
    function eventWinProbability(inputs, samples, statsOut) {
        // EXPECTED_RUNS_CONSISTENCY_20260623: optionally accumulate the mean simulated
        // runs per side over the SAME sample of games used for win probability, so the
        // caller can display expected runs that match the box scores exactly (one model).
        var homeWins = 0, total = 0, aSum = 0, hSum = 0;
        for (var i = 0; i < samples; i++) {
            var g = evSimGame(inputs.awaySide, inputs.homeSide, Math.random);
            if (g.hRuns > g.aRuns) homeWins++;
            else if (g.aRuns > g.hRuns) { /* away */ } else homeWins += 0.5;
            aSum += g.aRuns; hSum += g.hRuns;
            total++;
        }
        if (statsOut && total) { statsOut.awayMean = aSum / total; statsOut.homeMean = hSum / total; }
        return total ? homeWins / total : 0.5;
    }
    // Every batter who appeared, across all slots (starter first, then subs). With no
    // substitutions this is exactly side.lineup. Used everywhere team batting is summed,
    // because side.lineup only holds the CURRENT occupants and would drop the stats of
    // a starter who was pinch-hit / injured / ejected out of the game.
    function evAllBatters(side) {
        var occupants = [];
        if (Array.isArray(side.lineupSlots)) {
            side.lineupSlots.forEach(function (slotArr, slotIdx) {
                slotArr.forEach(function (b, occIdx) { occupants.push({ b: b, slot: slotIdx, sub: occIdx > 0 }); });
            });
        } else {
            side.lineup.forEach(function (b, slotIdx) { occupants.push({ b: b, slot: slotIdx, sub: false }); });
        }
        return occupants;
    }
    function evBatterRows(side) {
        // Stage 3: iterate the full slot history (starter first, then each
        // substitute in the same batting-order slot) so subs get their own line
        // indented under the starter. With no substitutions each slot has exactly
        // one occupant and this is identical to mapping side.lineup.
        return evAllBatters(side).map(function (rec) {
            var b = rec.b;
            var a = b.acc;
            // TMR_EVENTLOG_20260723: GAME rate stats are computed from this game's
            // own line and kept STRICTLY separate from the player's season figures.
            // The previous version silently swapped between game AVG, real-season
            // AVG and a fabricated OPS (avg * 2.55 + 0.18) in the same two columns.
            var tb = (a.b1 || 0) + 2 * (a.b2 || 0) + 3 * (a.b3 || 0) + 4 * (a.hr || 0);
            var obDen = a.ab + (a.bb || 0) + (a.hbp || 0) + (a.sf || 0);
            var gameAvg = a.ab > 0 ? a.h / a.ab : null;
            var gameObp = obDen > 0 ? (a.h + (a.bb || 0) + (a.hbp || 0)) / obDen : null;
            var gameSlg = a.ab > 0 ? tb / a.ab : null;
            return {
                name: b.name, playerName: b.playerName, rawPos: b.rawPos,
                slot: rec.slot, sub: rec.sub, subRole: b.isBench ? (b.rawPos === 'PH' ? 'PH' : 'sub') : null,
                pa: a.pa, ab: a.ab, r: a.r, h: a.h, hr: a.hr, rbi: a.rbi, bb: a.bb, ibb: a.ibb || 0,
                so: a.so, lob: a.lob, hbp: a.hbp || 0, gidp: a.gidp || 0, sf: a.sf || 0, sh: a.sac || 0,
                b1: a.b1 || 0, b2: a.b2, b3: a.b3, tb: tb, sb: a.sb || 0, cs: a.cs || 0,
                // game mode
                gameAvg: gameAvg, gameObp: gameObp, gameSlg: gameSlg,
                gameOps: (gameObp == null || gameSlg == null) ? null : gameObp + gameSlg,
                // season mode (real, never synthesised - null when unknown)
                seasonAvg: b.realAvg != null ? b.realAvg : null,
                seasonOps: b.realOps != null ? b.realOps : null,
                statSource: b.statSource
            };
        }).filter(function (row) { return row.name; });
    }
    function evPitcherRows(side) {
        return side.pitchers.filter(function (p) { return p.acc.outs > 0 || p.acc.h > 0 || p.acc.bb > 0; }).map(function (p) {
            var a = p.acc;
            // RELIEVER_HAND_20260623: show the real throw hand on bullpen arms (LHP/RHP)
            // when the profile is available; cosmetic only (does not affect the sim math).
            var handTag = p.hand === 'L' ? ' (LHP)' : p.hand === 'R' ? ' (RHP)' : '';
            return {
                name: p.name + handTag, outs: a.outs, ip: outsToIp(a.outs), h: a.h, r: a.r,
                er: Math.min(a.r, a.er), bb: a.bb, ibb: a.ibb || 0, so: a.so, hr: a.hr, hbp: a.hbp || 0,
                bf: a.bf || 0, pitches: a.pitches || 0, strikes: a.strikes || 0,
                fps: a.fps || 0, whiff: a.whiff || 0, ir: a.ir || 0, irs: a.irs || 0
            };
        });
    }
    // Every situational stat here is EVENT-SOURCED from the simulated plate
    // appearances (June 4, 2026) — no post-hoc estimates, no random garnish.
    function evSummaryStats(side, runs, hits, errors, random) {
        var rows = evAllBatters(side).map(function (rec) { return rec.b.acc; });
        var doubles = sum(rows.map(function (r) { return r.b2; }));
        var triples = sum(rows.map(function (r) { return r.b3; }));
        var homeRuns = sum(rows.map(function (r) { return r.hr; }));
        var rbi = sum(rows.map(function (r) { return r.rbi; }));
        var walks = sum(rows.map(function (r) { return r.bb; }));
        var strikeouts = sum(rows.map(function (r) { return r.so; }));
        var singles = Math.max(0, hits - doubles - triples - homeRuns);
        var totalBases = singles + doubles * 2 + triples * 3 + homeRuns * 4;
        var totalPitches = 0, totalStrikes = 0;
        side.pitchers.forEach(function (p) {
            totalPitches += p.acc.pitches || 0; totalStrikes += p.acc.strikes || 0;
        });
        return {
            doubles: doubles, triples: triples, homeRuns: homeRuns, rbi: rbi, walks: walks, strikeouts: strikeouts,
            stolenBases: side.sb || 0, caughtStealing: side.cs || 0, leftOnBase: side.lob || 0,
            totalPitches: totalPitches, totalStrikes: totalStrikes, hits: hits, runs: runs, errors: errors,
            totalBases: totalBases, twoOutRbi: side.twoOutRbi || 0,
            lispLeft2Out: side.lisp2out || 0, gidp: side.gidp || 0,
            sacFlies: side.sf || 0, sacBunts: side.sacBunts || 0, hbp: side.hbp || 0,
            rispText: (side.rispHits || 0) + '-for-' + (side.rispAb || 0), pickoffs: side.pickoffs || 0,
            outfieldAssists: side.ofAssists || 0, dp: side.dpTurned || 0, ibb: side.ibb || 0
        };
    }
    function assembleEventBoxScore(inputs, away, home, awayPitcher, homePitcher, random) {
        var scoringLog = [];
        var eventLog = elNewLog('sim-' + Date.now());
        var g = evSimGame(inputs.awaySide, inputs.homeSide, random, { scoring: scoringLog, el: eventLog });
        var awayHits = sum(evAllBatters(inputs.awaySide).map(function (rec) { return rec.b.acc.h; }));
        var homeHits = sum(evAllBatters(inputs.homeSide).map(function (rec) { return rec.b.acc.h; }));
        // Innings arrays are now complete per-inning (extras included). Home may be
        // one inning short when the bottom 9th was skipped — shown as X, never 0.
        var totalInnings = Math.max(9, g.aInn.length);
        var homeSkippedFinal = g.hInn.length < g.aInn.length;
        var awayInnings = evPadInnings(g.aInn, totalInnings);
        var homeInnings = evPadInnings(g.hInn, homeSkippedFinal ? totalInnings - 1 : totalInnings);
        var winner = g.hRuns > g.aRuns ? home : away;
        var loser = g.hRuns > g.aRuns ? away : home;
        var awayBatters = evBatterRows(inputs.awaySide);
        var homeBatters = evBatterRows(inputs.homeSide);
        var awayPitchers = evPitcherRows(inputs.awaySide);
        var homePitchers = evPitcherRows(inputs.homeSide);
        var awayLine = { team: away, innings: awayInnings, runs: g.aRuns, hits: awayHits, errors: g.aErr, starter: awayPitcher };
        var homeLine = { team: home, innings: homeInnings, runs: g.hRuns, hits: homeHits, errors: g.hErr, starter: homePitcher };
        awayLine.summaryStats = evSummaryStats(inputs.awaySide, g.aRuns, awayHits, g.aErr, random);
        homeLine.summaryStats = evSummaryStats(inputs.homeSide, g.hRuns, homeHits, g.hErr, random);
        var lineupStatusAway = lineupStatusFor(away, inputs.awaySide.roster);
        var lineupStatusHome = lineupStatusFor(home, inputs.homeSide.roster);
        var winnerPitcher = winner === home ? homePitcher : awayPitcher;
        var extraNote = g.extra > 9 ? ' (' + g.extra + ' innings)' : '';
        // TMR_EVENTLOG_20260723: the folded views are the authoritative derivation.
        // Stage 2 runs them ALONGSIDE the legacy accumulator output and records any
        // disagreement in `reconciliation`, so a mismatch is visible instead of silent.
        var folded = {
            lineScore: foldLineScore(eventLog),
            batting: { away: foldBatting(eventLog, 'away'), home: foldBatting(eventLog, 'home') },
            pitching: { away: foldPitching(eventLog, 'away'), home: foldPitching(eventLog, 'home') },
            playByPlay: foldPlayByPlay(eventLog),
            notes: { away: foldNotes(eventLog, 'away'), home: foldNotes(eventLog, 'home') }
        };
        var reconciliation = elReconcile(folded, {
            aRuns: g.aRuns, hRuns: g.hRuns, aHits: awayHits, hHits: homeHits, aErr: g.aErr, hErr: g.hErr,
            awayBatters: awayBatters, homeBatters: homeBatters,
            awayPitchers: awayPitchers, homePitchers: homePitchers,
            awaySide: inputs.awaySide, homeSide: inputs.homeSide
        });
        return {
            runId: String(Date.now()) + '-' + Math.floor(random() * 1000000),
            totalInnings: totalInnings, homeSkippedFinal: homeSkippedFinal,
            walkOff: g.walkOff, extraInnings: g.extra > 9,
            scoringLog: scoringLog,
            eventLog: eventLog, folded: folded, reconciliation: reconciliation,
            away: awayLine, home: homeLine, winner: winner, loser: loser,
            players: {
                away: { batters: awayBatters, pitchers: awayPitchers, rosterSource: evRosterSource(inputs.awaySide), lineupStatus: lineupStatusAway },
                home: { batters: homeBatters, pitchers: homePitchers, rosterSource: evRosterSource(inputs.homeSide), lineupStatus: lineupStatusHome }
            },
            summary: winner.name + ' defeats ' + loser.name + ', ' + Math.max(g.aRuns, g.hRuns) + '-' + Math.min(g.aRuns, g.hRuns) + extraNote + '. ' + (winnerPitcher ? winnerPitcher.name + ' starts for the winning side. ' : '') + 'Box score simulated plate-appearance by plate-appearance.',
            pitcherLines: [
                away.name + ': ' + (awayPitchers[0] ? awayPitchers[0].name + ' ' + awayPitchers[0].ip + ' IP, ' + awayPitchers[0].h + ' H, ' + awayPitchers[0].r + ' R, ' + awayPitchers[0].so + ' K' : 'Starter unavailable'),
                home.name + ': ' + (homePitchers[0] ? homePitchers[0].name + ' ' + homePitchers[0].ip + ' IP, ' + homePitchers[0].h + ' H, ' + homePitchers[0].r + ' R, ' + homePitchers[0].so + ' K' : 'Starter unavailable')
            ],
            keyPerformers: [evTopHitter(awayBatters, away), evTopHitter(homeBatters, home)]
        };
    }
    // =====================================================================
    // TMR_EVENTLOG reducers. Each is a pure fold over log.events. Nothing here
    // reads the engine's mutable accumulators, so the reducer output is an
    // INDEPENDENT derivation of the same game - which is exactly what makes it
    // a real cross-check (see foldShadowCompare / validate-boxscore-events.cjs).
    // =====================================================================
    function elIsPa(e) {
        return e.eventType === EL_TYPES.PA;
    }
    function foldLineScore(log) {
        var away = { innings: [], r: 0, h: 0, e: 0, lob: 0 };
        var home = { innings: [], r: 0, h: 0, e: 0, lob: 0 };
        var HIT = { '1B': 1, '2B': 1, '3B': 1, HR: 1 };
        log.events.forEach(function (e) {
            var bat = e.battingTeam === 'home' ? home : away;
            var fld = e.battingTeam === 'home' ? away : home;
            if (e.eventType === EL_TYPES.INNING_START) {
                while (bat.innings.length < e.inning) bat.innings.push(0);
            } else if (elIsPa(e)) {
                if (HIT[e.result.code]) bat.h++;
                if (e.result.code === 'E') fld.e++;
                bat.r += (e.runsScored || []).length;
                if (bat.innings.length >= e.inning) bat.innings[e.inning - 1] += (e.runsScored || []).length;
            } else if (e.eventType === EL_TYPES.INNING_END) {
                bat.lob += e.lob || 0;
            }
        });
        return { away: away, home: home };
    }
    function foldBatting(log, team) {
        // Keyed by slot + player, so a substitute in the same batting-order slot is
        // its OWN row (starter and sub appear separately, as on a real box score),
        // while rows stay ordered by batting slot then entry order.
        var rows = {}, order = [];
        function row(slot, name) {
            var key = slot + '|' + (name || '?');
            if (!rows[key]) {
                rows[key] = {
                    slot: slot, name: name, entry: order.length, sub: false, pa: 0, ab: 0, r: 0, h: 0,
                    b1: 0, b2: 0, b3: 0, hr: 0, rbi: 0, bb: 0, ibb: 0, so: 0, hbp: 0, sb: 0, cs: 0,
                    gidp: 0, sf: 0, sh: 0, lob: 0, tb: 0
                };
                order.push(rows[key]);
            }
            return rows[key];
        }
        log.events.forEach(function (e) {
            if (e.battingTeam !== team && !(e.eventType === EL_TYPES.SUB && e.subjectTeam === team)) return;
            if (e.eventType === EL_TYPES.SUB && e.substitutionData && e.substitutionData.role !== 'P' && e.subjectTeam === team) {
                var sr = row(e.substitutionData.slot, e.substitutionData.in);
                sr.sub = true;
                return;
            }
            if (e.battingTeam !== team) return;
            if (elIsPa(e)) {
                var r = row(e.batterSlot, e.batterId);
                var c = e.result.code;
                r.pa++;
                if (c !== 'BB' && c !== 'IBB' && c !== 'HBP' && c !== 'SF' && c !== 'SH') r.ab++;
                if (c === '1B') { r.h++; r.b1++; r.tb += 1; }
                else if (c === '2B') { r.h++; r.b2++; r.tb += 2; }
                else if (c === '3B') { r.h++; r.b3++; r.tb += 3; }
                else if (c === 'HR') { r.h++; r.hr++; r.tb += 4; }
                else if (c === 'BB') r.bb++;
                else if (c === 'IBB') { r.bb++; r.ibb++; }
                else if (c === 'HBP') r.hbp++;
                else if (c === 'K') r.so++;
                else if (c === 'SF') r.sf++;
                else if (c === 'SH') r.sh++;
                else if (c === 'GIDP') r.gidp++;
                r.rbi += (e.runsScored || []).filter(function (x) { return x.rbiCredited; }).length;
            }
            (e.runsScored || []).forEach(function (x) {
                if (x.runnerSlot === undefined || x.runnerSlot === null) return;
                row(x.runnerSlot, x.runnerId).r++;
            });
            if (e.eventType === EL_TYPES.STEAL && e.runnerSlot != null) {
                var st = row(e.runnerSlot, e.runnerId);
                if (e.safe) st.sb++; else st.cs++;
            }
            if (e.eventType === EL_TYPES.INNING_END && e.lob) {
                // Charge the batter who made the inning-ending out, as on a real
                // box score: the last PA of the half that produced the third out.
                var prev = null;
                for (var i = log.events.indexOf(e) - 1; i >= 0; i--) {
                    var p = log.events[i];
                    if (p.eventType === EL_TYPES.INNING_START) break;
                    if (elIsPa(p) && p.outsAfter > p.outsBefore) { prev = p; break; }
                }
                if (prev) row(prev.batterSlot, prev.batterId).lob += e.lob;
            }
        });
        return order.sort(function (a, b) { return (a.slot - b.slot) || (a.entry - b.entry); });
    }
    function foldPitching(log, team) {
        // `team` is the FIELDING side here.
        var arms = {}, order = [];
        function row(name) {
            if (!arms[name]) {
                arms[name] = {
                    name: name, outs: 0, bf: 0, h: 0, r: 0, er: 0, bb: 0, ibb: 0, so: 0, hr: 0, hbp: 0,
                    pitches: 0, strikes: 0, fps: 0, whiff: 0, gb: 0, fb: 0, ir: 0, irs: 0, entered: null
                };
                order.push(name);
            }
            return arms[name];
        }
        var HIT = { '1B': 1, '2B': 1, '3B': 1, HR: 1 };
        log.events.forEach(function (e) {
            if (e.fieldingTeam !== team) return;
            if (e.eventType === EL_TYPES.SUB && e.substitutionData && e.substitutionData.role === 'P') {
                var inc = row(e.substitutionData.in);
                if (inc.entered === null) inc.entered = { inning: e.inning, half: e.half };
                inc.ir += e.substitutionData.inheritedRunners || 0;
                return;
            }
            if (!e.pitcherId) return;
            var p = row(e.pitcherId);
            if (p.entered === null) p.entered = { inning: e.inning, half: e.half };
            p.outs += Math.max(0, (e.outsAfter || 0) - (e.outsBefore || 0));
            (e.pitches || []).forEach(function (pt) {
                p.pitches++;
                if (pt.call !== 'B' && pt.call !== 'H') p.strikes++;
                if (pt.n === 1 && pt.call !== 'B' && pt.call !== 'H') p.fps++;
                if (pt.call === 'SS') p.whiff++;
            });
            if (elIsPa(e)) {
                p.bf++;
                var c = e.result.code;
                if (HIT[c]) p.h++;
                if (c === 'HR') p.hr++;
                if (c === 'BB') p.bb++;
                if (c === 'IBB') { p.bb++; p.ibb++; }
                if (c === 'HBP') p.hbp++;
                if (c === 'K') p.so++;
                if (e.result.bip) { if (e.result.bip.type === 'GB') p.gb++; else p.fb++; }
            }
            (e.runsScored || []).forEach(function (x) {
                var charged = row(x.chargedPitcherId || e.pitcherId);
                charged.r++;
                if (x.earned) charged.er++;
                if (x.chargedPitcherId && x.chargedPitcherId !== e.pitcherId) p.irs++;
            });
        });
        return order.map(function (n) { return arms[n]; });
    }
    function foldPlayByPlay(log) {
        var halves = [], cur = null;
        log.events.forEach(function (e) {
            if (e.eventType === EL_TYPES.INNING_START) {
                cur = {
                    inning: e.inning, half: e.half,
                    battingTeamAbbr: e.battingTeamAbbr, fieldingTeamAbbr: e.fieldingTeamAbbr,
                    plays: [], runs: 0, hits: 0, lob: 0,
                    scoreStart: e.scoreBefore
                };
                halves.push(cur);
                return;
            }
            if (!cur) return;
            if (e.eventType === EL_TYPES.INNING_END) {
                cur.lob = e.lob || 0; cur.runs = e.runsThisHalf || 0; cur.scoreEnd = e.scoreAfter;
                return;
            }
            if (e.eventType === EL_TYPES.GAME_END) return;
            var HIT = { '1B': 1, '2B': 1, '3B': 1, HR: 1 };
            if (elIsPa(e) && HIT[e.result.code]) cur.hits++;
            cur.plays.push({
                seq: e.seq, type: e.eventType,
                batter: e.batterId || null, pitcher: e.pitcherId || null,
                code: e.result.code, detail: e.result.detail,
                basesBefore: e.baseStateBefore, basesAfter: e.baseStateAfter,
                outsBefore: e.outsBefore, outsAfter: e.outsAfter,
                runs: (e.runsScored || []).length, rbi: e.rbi || 0,
                scoreAfter: e.scoreAfter,
                bip: (e.result && e.result.bip) || null,
                pitches: e.pitches || [],
                sub: e.substitutionData || null,
                wpBefore: e.winProbBefore, wpAfter: e.winProbAfter, wpa: e.wpaDelta, li: e.leverageIndex
            });
        });
        return halves;
    }
    function foldNotes(log, team) {
        var n = {
            doubles: [], triples: [], homeRuns: [], rbi: [], twoOutRbi: 0, sacFlies: [], sacBunts: [],
            gidp: [], risp: { h: 0, ab: 0 }, lob: 0,
            sb: [], cs: [], pickoffs: [], outsOnBases: 0,
            errors: [], dp: 0, ofAssists: 0,
            hbp: [], ibb: [], inherited: 0, inheritedScored: 0,
            pitchingChanges: [], injuries: [], ejections: []
        };
        log.events.forEach(function (e) {
            var isBat = e.battingTeam === team;
            var isFld = e.fieldingTeam === team;
            if (elIsPa(e) && isBat) {
                var c = e.result.code, b = e.batterId;
                if (c === '2B') n.doubles.push(b);
                else if (c === '3B') n.triples.push(b);
                else if (c === 'HR') n.homeRuns.push({ batter: b, inning: e.inning, half: e.half, runs: (e.runsScored || []).length, off: e.pitcherId, dist: e.result.bip && e.result.bip.dist });
                else if (c === 'SF') n.sacFlies.push(b);
                else if (c === 'SH') n.sacBunts.push(b);
                else if (c === 'GIDP') n.gidp.push(b);
                else if (c === 'HBP') n.hbp.push(b);
                else if (c === 'IBB') n.ibb.push(b);
                var rbis = (e.runsScored || []).filter(function (x) { return x.rbiCredited; }).length;
                if (rbis) n.rbi.push({ batter: b, rbi: rbis });
                if (e.outsBefore === 2 && rbis) n.twoOutRbi += rbis;
                var risp = e.baseStateBefore && (e.baseStateBefore[1] !== null || e.baseStateBefore[2] !== null);
                var countsAsAb = c !== 'BB' && c !== 'IBB' && c !== 'HBP' && c !== 'SF' && c !== 'SH';
                if (risp && countsAsAb) { n.risp.ab++; if (c === '1B' || c === '2B' || c === '3B' || c === 'HR') n.risp.h++; }
            }
            if (elIsPa(e) && isFld && e.result.code === 'E') n.errors.push({ pos: e.result.bip && e.result.bip.field, inning: e.inning });
            if (elIsPa(e) && isFld && e.result.code === 'GIDP') n.dp++;
            if (elIsPa(e) && isFld && e.result.ofAssist) n.ofAssists++;
            if (e.eventType === EL_TYPES.STEAL && isBat) { if (e.safe) n.sb.push(e.runnerId); else { n.cs.push(e.runnerId); n.outsOnBases++; } }
            if (e.eventType === EL_TYPES.PICKOFF && isBat) { n.pickoffs.push(e.runnerId); n.outsOnBases++; }
            if (e.eventType === EL_TYPES.INNING_END && isBat) n.lob += e.lob || 0;
            if (e.eventType === EL_TYPES.SUB && isFld && e.substitutionData && e.substitutionData.role === 'P') {
                n.pitchingChanges.push(e.substitutionData);
                n.inherited += e.substitutionData.inheritedRunners || 0;
            }
            // Substitutions, injuries and ejections attribute to the SUBJECT's team.
            if (e.eventType === EL_TYPES.SUB && e.subjectTeam === team && e.substitutionData && e.substitutionData.role !== 'P') {
                n.substitutions = n.substitutions || [];
                n.substitutions.push(e.substitutionData);
            }
            if (e.eventType === EL_TYPES.INJURY && e.subjectTeam === team && e.injuryData) n.injuries.push(e.injuryData);
            if (e.eventType === EL_TYPES.EJECTION && e.subjectTeam === team && e.ejectionData) n.ejections.push(e.ejectionData);
        });
        // Inherited runners that scored, read straight off the run ledger.
        log.events.forEach(function (e) {
            if (e.fieldingTeam !== team) return;
            (e.runsScored || []).forEach(function (x) {
                if (x.chargedPitcherId && e.pitcherId && x.chargedPitcherId !== e.pitcherId) n.inheritedScored++;
            });
        });
        return n;
    }
    // Stage-2 shadow compare: the reducers (folded from the event log) must agree
    // with the engine accumulators on every shared quantity. Any disagreement is a
    // real defect in one of the two derivations and is surfaced, never smoothed.
    function elReconcile(folded, eng) {
        var issues = [];
        function eq(label, a, b) { if (a !== b) issues.push(label + ': log=' + a + ' engine=' + b); }
        var ls = folded.lineScore;
        eq('awayRuns', ls.away.r, eng.aRuns);
        eq('homeRuns', ls.home.r, eng.hRuns);
        eq('awayHits', ls.away.h, eng.aHits);
        eq('homeHits', ls.home.h, eng.hHits);
        eq('awayErrors', ls.away.e, eng.aErr);
        eq('homeErrors', ls.home.e, eng.hErr);
        function tot(rows, k) { return rows.reduce(function (t, r) { return t + (Number(r[k]) || 0); }, 0); }
        ['away', 'home'].forEach(function (sideKey) {
            var fb = folded.batting[sideKey], eb = sideKey === 'away' ? eng.awayBatters : eng.homeBatters;
            ['ab', 'r', 'h', 'hr', 'rbi', 'bb', 'so'].forEach(function (k) {
                eq(sideKey + 'Bat.' + k, tot(fb, k), tot(eb, k));
            });
            var fp = folded.pitching[sideKey], ep = sideKey === 'away' ? eng.awayPitchers : eng.homePitchers;
            ['outs', 'h', 'r', 'bb', 'so', 'hr'].forEach(function (k) {
                eq(sideKey + 'Pit.' + k, tot(fp, k), tot(ep, k));
            });
            // Pitch log must equal the pitch count, exactly (validation item 8).
            var side = sideKey === 'away' ? eng.awaySide : eng.homeSide;
            var accP = side.pitchers.reduce(function (t, p) { return t + (p.acc.pitches || 0); }, 0);
            var accS = side.pitchers.reduce(function (t, p) { return t + (p.acc.strikes || 0); }, 0);
            eq(sideKey + 'Pit.pitches', tot(fp, 'pitches'), accP);
            eq(sideKey + 'Pit.strikes', tot(fp, 'strikes'), accS);
        });
        // Cross-side: a staff's hits allowed equal the opposing lineup's hits.
        eq('awayStaffH!=homeBatH', tot(folded.pitching.away, 'h'), tot(folded.batting.home, 'h'));
        eq('homeStaffH!=awayBatH', tot(folded.pitching.home, 'h'), tot(folded.batting.away, 'h'));
        eq('awayStaffR!=homeRuns', tot(folded.pitching.away, 'r'), ls.home.r);
        eq('homeStaffR!=awayRuns', tot(folded.pitching.home, 'r'), ls.away.r);
        return { clean: issues.length === 0, issues: issues };
    }
    function evPadInnings(innArr, count) {
        var innings = innArr.slice(0, count);
        while (innings.length < count) innings.push(0);
        return innings;
    }
    function evRosterSource(side) {
        if (side.hasNamedLineup) return side.roster.source || 'Projected lineup from verified active roster names';
        return 'Synthetic league-average lineup (verified roster unavailable; names not shown)';
    }
    function evTopHitter(batters, team) {
        var best = batters.slice().sort(function (a, b) { return (b.h * 2 + b.hr * 3 + b.rbi) - (a.h * 2 + a.hr * 3 + a.rbi); })[0];
        if (!best || !best.playerName) return team.abbreviation + ' lineup contributed across the order';
        return team.abbreviation + ': ' + best.playerName + ' ' + best.h + '-for-' + best.ab + (best.hr ? ', ' + best.hr + ' HR' : '') + (best.rbi ? ', ' + best.rbi + ' RBI' : '');
    }
    function buildBoxScoreLegacy(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, awayWin, homeWin, seedSalt, allowUpset, rosterContext) {
        var random = Math.random;
        var awayScore = controlledFinalScore(awayRuns, homeRuns, awayWin, random);
        var homeScore = controlledFinalScore(homeRuns, awayRuns, homeWin, random);
        if (awayScore === homeScore) {
            if (random() < homeWin) homeScore += 1;
            else awayScore += 1;
        }
        var combined = awayScore + homeScore;
        if (combined > 30) {
            var excess = combined - 30;
            while (excess > 0) {
                if (awayScore >= homeScore && awayScore > 0) awayScore -= 1;
                else if (homeScore > 0) homeScore -= 1;
                excess -= 1;
            }
            if (awayScore === homeScore) {
                if (random() < homeWin && awayScore > 0) awayScore -= 1;
                else if (homeScore > 0) homeScore -= 1;
            }
        }
        awayScore = clamp(awayScore, 0, 20);
        homeScore = clamp(homeScore, 0, 20);
        while (awayScore + homeScore > 30) {
            if (awayScore >= homeScore && awayScore > 0) awayScore -= 1;
            else if (homeScore > 0) homeScore -= 1;
            else break;
        }
        if (awayScore === homeScore) {
            if (random() < homeWin) {
                if (homeScore < 20 && awayScore + homeScore < 30) homeScore += 1;
                else if (awayScore > 0) awayScore -= 1;
            } else {
                if (awayScore < 20 && awayScore + homeScore < 30) awayScore += 1;
                else if (homeScore > 0) homeScore -= 1;
            }
        }
        while (awayScore + homeScore > 30) {
            if (awayScore >= homeScore && awayScore > 0) awayScore -= 1;
            else if (homeScore > 0) homeScore -= 1;
            else break;
        }
        var awayInnings = distributeRuns(awayScore, awayRuns, random, false);
        var homeInnings = distributeRuns(homeScore, homeRuns, random, true);
        var awayHits = hitTotalForRuns(awayScore, away, homePitcher, random);
        var homeHits = hitTotalForRuns(homeScore, home, awayPitcher, random);
        var awayErrors = errorTotal(away, random);
        var homeErrors = errorTotal(home, random);
        var winner = homeScore > awayScore ? home : away;
        var loser = homeScore > awayScore ? away : home;
        var winnerPitcher = homeScore > awayScore ? homePitcher : awayPitcher;
        var awayLate = awayInnings[6] + awayInnings[7] + awayInnings[8];
        var homeLate = homeInnings[6] + homeInnings[7] + homeInnings[8];
        var turningPoint = (awayLate || homeLate) ? 'Late innings swung ' + (homeLate >= awayLate ? home.abbreviation : away.abbreviation) + ' with a ' + Math.max(awayLate, homeLate) + '-run finish.' : 'The game stayed controlled after the starters set the run environment.';
        var awayLine = { team: away, innings: awayInnings, runs: awayScore, hits: awayHits, errors: awayErrors, starter: awayPitcher };
        var homeLine = { team: home, innings: homeInnings, runs: homeScore, hits: homeHits, errors: homeErrors, starter: homePitcher };
        var players = modeledPlayerBox(away, home, awayLine, homeLine, awayPitcher, homePitcher, random, rosterContext);
        awayLine.summaryStats = teamSummaryStats(awayLine, players.away, random);
        homeLine.summaryStats = teamSummaryStats(homeLine, players.home, random);
        return {
            runId: String(Date.now()) + '-' + Math.floor(random() * 1000000),
            away: awayLine,
            home: homeLine,
            winner: winner,
            loser: loser,
            players: players,
            summary: winner.name + ' defeats ' + loser.name + ', ' + Math.max(awayScore, homeScore) + '-' + Math.min(awayScore, homeScore) + '. ' + (winnerPitcher ? winnerPitcher.name + ' gives the winning side the stronger starter profile. ' : '') + turningPoint,
            pitcherLines: [
                away.name + ': ' + (awayPitcher ? awayPitcher.name : 'Starter unavailable') + ' / ' + clamp(5 + Math.round(random() * 2), 4, 7) + ' IP model line',
                home.name + ': ' + (homePitcher ? homePitcher.name : 'Starter unavailable') + ' / ' + clamp(5 + Math.round(random() * 2), 4, 7) + ' IP model line'
            ],
            keyPerformers: [
                winner.abbreviation + ' lineup: ' + Math.max(2, Math.min(5, Math.round(Math.max(awayScore, homeScore) / 2))) + ' run-scoring chances converted',
                loser.abbreviation + ' lineup: ' + Math.max(1, Math.min(4, Math.round(Math.min(awayScore, homeScore) / 2) + 1)) + ' scoring chances'
            ]
        };
    }
    function expectedRunsFor(offenseTeam, defenseTeam, homeBonus) {
        var offenseLift = (offenseTeam.offense - 100) * 0.05;
        var starterDrag = (100 - defenseTeam.startingPitching) * 0.025;
        var bullpenDrag = (100 - defenseTeam.bullpen) * 0.021;
        var preventionDrag = (100 - defenseTeam.runPrevention) * 0.021;
        return clamp(4.45 + offenseLift + starterDrag + bullpenDrag + preventionDrag + homeBonus, 2.0, 9.7);
    }
    function volatilityLabel(value) {
        if (value >= 1.07) return 'High';
        if (value <= 0.97) return 'Low';
        return 'Medium';
    }
    function confidenceLabel(winPct, strengthGap) {
        if (winPct >= 0.64 || strengthGap >= 9) return 'Strong lean';
        if (winPct >= 0.56 || strengthGap >= 5) return 'Moderate lean';
        return 'Tight matchup';
    }
    function eraAdjustmentNote(away, home) {
        if (away.era === 'historical' && home.era === 'historical') return 'Classic teams normalized by era';
        if (away.era === 'historical' || home.era === 'historical') return 'Cross-era ratings normalized';
        return 'Same-era current baseline';
    }
    function modeHelpText() {
        if (state.preset === 'historical') return 'Classic Teams mode compares curated historical clubs on era-normalized baseline ratings.';
        if (state.preset === 'mixed') return 'Mixed Era Matchup mode normalizes current and classic teams into one simulator baseline.';
        if (state.preset === 'custom') return 'Custom mode uses the selected pool for each side.';
        return 'Current Teams mode compares two modern MLB baseline profiles.';
    }
    function simulationModeLabel() {
        if (state.preset === 'historical') return 'Classic baseline';
        if (state.preset === 'mixed') return 'Mixed-era baseline';
        if (state.preset === 'custom') return 'Custom baseline';
        return 'Current baseline';
    }
    function verifiedLiveInputs() {
        return state.liveInputs.filter(function (source) { return source.verified; });
    }
    function dataModeLabel() {
        return verifiedLiveInputs().length ? 'Verified live inputs' : 'Baseline ratings';
    }
    function dataModeDetail() {
        if (state.backendProjectionStatus && state.backendProjectionStatus.reason === 'missing_config') {
            return 'Backend live projection feed is not active because ' + state.backendProjectionStatus.missingEnv.join(', ') + ' is not configured. Baseline simulation remains available.';
        }
        if (state.awayPool === 'historical' || state.homePool === 'historical') return 'Classic and mixed-era matchups use historical baseline model ratings; live inputs are current-game only.';
        if (verifiedLiveInputs().length) return 'Verified live inputs are connected for this simulation where explicitly listed.';
        return 'Verified live inputs are unavailable, so this matchup will use internal baseline ratings.';
    }

    // DATA_MODE_CHIP_20260622: prominent per-run "Live-informed vs Baseline only" chip.
    function renderDataModeChip(result) {
        var el = byId('dataModeChip');
        if (!el) return;
        var base = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 2px;padding:8px 12px;border-radius:9px;font-size:0.8rem;line-height:1.4;color:#e7ecf3;';
        if (!result) {
            el.setAttribute('data-mode', 'idle');
            el.style.cssText = base + 'border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);';
            el.innerHTML = '<span style="width:9px;height:9px;border-radius:50%;background:#8b95a7;flex:none;"></span>'
                + '<strong>Data mode</strong>'
                + '<span style="opacity:0.8;">Run a simulation to see which inputs were live vs baseline.</span>';
            return;
        }
        var used = (result.dataSourcesUsed || []);
        var live = used.length > 0;
        var color = live ? '#22c55e' : '#f5b301';
        el.setAttribute('data-mode', live ? 'live' : 'baseline');
        el.style.cssText = base + 'border:1px solid ' + (live ? 'rgba(34,197,94,0.4)' : 'rgba(245,179,1,0.4)')
            + ';background:' + (live ? 'rgba(34,197,94,0.10)' : 'rgba(245,179,1,0.10)') + ';';
        var head = live
            ? 'Live-informed (' + used.length + ' ' + (used.length === 1 ? 'feed' : 'feeds') + ')'
            : 'Baseline only';
        var detail = live
            ? 'Live: ' + used.join(', ')
            : 'No live feeds matched this matchup; internal baseline ratings used.';
        el.innerHTML = '<span style="width:9px;height:9px;border-radius:50%;background:' + color + ';flex:none;"></span>'
            + '<strong style="color:' + color + ';">' + head + '</strong>'
            + '<span style="opacity:0.85;">' + detail + '</span>';
    }

    function parseRecord(summary) {
        var match = String(summary || '').match(/(\d+)\s*-\s*(\d+)/);
        if (!match) return null;
        var wins = Number(match[1]);
        var losses = Number(match[2]);
        var total = wins + losses;
        if (!total) return null;
        return { wins: wins, losses: losses, pct: wins / total, summary: wins + '-' + losses };
    }
    function recordFromCompetitor(comp) {
        var records = Array.isArray(comp && comp.records) ? comp.records : [];
        var overall = records.filter(function (record) { return record && (record.name === 'overall' || record.type === 'total'); })[0] || records[0];
        return parseRecord(overall && overall.summary);
    }
    function probableFromCompetitor(comp) {
        var probable = Array.isArray(comp && comp.probables) ? comp.probables[0] : null;
        if (!probable) return null;
        var eraStat = (probable.statistics || []).filter(function (stat) { return stat && String(stat.abbreviation || stat.name).toUpperCase() === 'ERA'; })[0];
        var era = eraStat ? Number(eraStat.displayValue) : null;
        return {
            name: probable.athlete && (probable.athlete.displayName || probable.athlete.fullName) || probable.displayName || 'Probable starter',
            record: probable.record || '',
            era: Number.isFinite(era) ? era : null
        };
    }
    function extractWeather(event) {
        var weather = event && event.weather || null;
        if (!weather) return null;
        var temp = Number(weather.temperature != null ? weather.temperature : weather.highTemperature);
        return {
            display: weather.displayValue || '',
            temperature: Number.isFinite(temp) ? temp : null,
            precipitation: Number(weather.precipitation),
            gust: Number(weather.gust)
        };
    }
    function extractEspnEvent(event) {
        var comp = event && event.competitions && event.competitions[0];
        var competitors = comp && Array.isArray(comp.competitors) ? comp.competitors : [];
        var home = competitors.filter(function (team) { return team.homeAway === 'home'; })[0];
        var away = competitors.filter(function (team) { return team.homeAway === 'away'; })[0];
        if (!home || !away) return null;
        var homeName = home.team && (home.team.displayName || home.team.name);
        var awayName = away.team && (away.team.displayName || away.team.name);
        return {
            id: event.id,
            homeTeam: homeName,
            awayTeam: awayName,
            commenceTime: event.date || comp.date,
            completed: !!(event.status && event.status.type && event.status.type.completed),
            statusDetail: event.status && event.status.type && (event.status.type.shortDetail || event.status.type.detail || event.status.type.description) || 'Scheduled',
            homeScore: home.score != null ? Number(home.score) : null,
            awayScore: away.score != null ? Number(away.score) : null,
            venue: comp.venue && comp.venue.fullName ? {
                name: comp.venue.fullName,
                city: comp.venue.address && comp.venue.address.city || '',
                state: comp.venue.address && comp.venue.address.state || '',
                indoor: comp.venue.indoor === true
            } : null,
            weather: extractWeather(event),
            homeRecord: recordFromCompetitor(home),
            awayRecord: recordFromCompetitor(away),
            homeStarter: probableFromCompetitor(home),
            awayStarter: probableFromCompetitor(away)
        };
    }
    function summaryForEvent(id) {
        return id && state.liveContext.espnSummaries ? state.liveContext.espnSummaries[id] || null : null;
    }
    function injuryStatus(item) {
        return item && (item.status || item.shortStatus || item.type && (item.type.abbreviation || item.type.description) || item.athlete && item.athlete.status && (item.athlete.status.abbreviation || item.athlete.status.name)) || '';
    }
    function injuryDetail(item) {
        return item && item.details && (item.details.type || item.details.detail || item.details.displayDetail || item.details.displayDescription) || '';
    }
    function injuryPosition(item) {
        return item && item.athlete && item.athlete.position && (item.athlete.position.abbreviation || item.athlete.position.displayName) || '';
    }
    function teamInjuryReport(summary, team) {
        var groups = Array.isArray(summary && summary.injuries) ? summary.injuries : [];
        var group = groups.filter(function (entry) { return entry && entry.team && normalizeName(entry.team.displayName) === normalizeName(team.name); })[0];
        var injuries = group && Array.isArray(group.injuries) ? group.injuries : [];
        if (!injuries.length) return null;
        var ilCount = injuries.filter(function (item) { return /IL|injured/i.test(injuryStatus(item)); }).length;
        var dayToDay = injuries.filter(function (item) { return /day/i.test(injuryStatus(item)); }).length;
        var rpCount = injuries.filter(function (item) { return /RP|Relief/i.test(injuryPosition(item)); }).length;
        var notable = injuries.slice(0, 3).map(function (item) {
            var name = item && item.athlete && (item.athlete.displayName || item.athlete.fullName) || 'Listed player';
            var pos = injuryPosition(item);
            var status = injuryStatus(item);
            var detail = injuryDetail(item);
            return name + (pos ? ' ' + pos : '') + (status ? ' ' + status : '') + (detail ? ' - ' + detail : '');
        });
        return {
            count: injuries.length,
            ilCount: ilCount,
            dayToDay: dayToDay,
            relieverCount: rpCount,
            notable: notable,
            summary: injuries.length + ' listed' + (ilCount ? ', ' + ilCount + ' IL' : '') + (rpCount ? ', ' + rpCount + ' RP' : '')
        };
    }
    function collectRosterPlayers(entry) {
        var players = [];
        function add(item) {
            if (!item) return;
            var athlete = item.athlete || item;
            var name = athlete.displayName || athlete.fullName || athlete.name;
            if (!name) return;
            players.push({
                name: name,
                position: athlete.position && (athlete.position.abbreviation || athlete.position.displayName) || item.position && item.position.abbreviation || ''
            });
        }
        (entry.roster || []).forEach(add);
        (entry.athletes || []).forEach(add);
        (entry.groups || []).forEach(function (group) { (group.athletes || group.roster || []).forEach(add); });
        var seen = {};
        return players.filter(function (player) {
            var key = normalizeName(player.name);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }
    function teamRosterContext(summary, team) {
        var groups = Array.isArray(summary && summary.rosters) ? summary.rosters : [];
        var group = groups.filter(function (entry) { return entry && entry.team && normalizeName(entry.team.displayName) === normalizeName(team.name); })[0];
        var players = group ? collectRosterPlayers(group) : [];
        if (!players.length) return null;
        var relievers = players.filter(function (player) { return /RP|Relief/i.test(player.position); }).length;
        return { count: players.length, relievers: relievers, players: players, summary: players.length + ' ESPN summary roster players' + (relievers ? ', ' + relievers + ' RP' : ''), source: 'ESPN summary roster - not used for current player rows' };
    }
    function summaryContext(summary, away, home) {
        if (!summary) return null;
        var injuries = {
            away: teamInjuryReport(summary, away),
            home: teamInjuryReport(summary, home)
        };
        var rosters = {
            away: teamRosterContext(summary, away),
            home: teamRosterContext(summary, home)
        };
        if (!injuries.away && !injuries.home && !rosters.away && !rosters.home) return null;
        return { injuries: injuries, rosters: rosters };
    }
    function teamsMatch(gameLike, away, home) {
        if (!gameLike || !away || !home) return false;
        var awayNames = [gameLike.away_team, gameLike.awayTeam].map(normalizeName);
        var homeNames = [gameLike.home_team, gameLike.homeTeam].map(normalizeName);
        return awayNames.indexOf(normalizeName(away.name)) !== -1 && homeNames.indexOf(normalizeName(home.name)) !== -1;
    }
    function getMarket(game, key) {
        var bookmakers = Array.isArray(game && game.bookmakers) ? game.bookmakers : [];
        for (var b = 0; b < bookmakers.length; b += 1) {
            var markets = Array.isArray(bookmakers[b].markets) ? bookmakers[b].markets : [];
            for (var m = 0; m < markets.length; m += 1) {
                if (markets[m].key === key) return { bookmaker: bookmakers[b], market: markets[m] };
            }
        }
        return null;
    }
    function marketOddsFor(game, away, home) {
        var h2h = getMarket(game, 'h2h');
        var totals = getMarket(game, 'totals');
        if (!h2h || !Array.isArray(h2h.market.outcomes)) return null;
        var awayOutcome = h2h.market.outcomes.filter(function (outcome) { return normalizeName(outcome.name) === normalizeName(away.name); })[0];
        var homeOutcome = h2h.market.outcomes.filter(function (outcome) { return normalizeName(outcome.name) === normalizeName(home.name); })[0];
        if (!awayOutcome || !homeOutcome) return null;
        var totalOutcome = totals && totals.market && Array.isArray(totals.market.outcomes) ? totals.market.outcomes[0] : null;
        return {
            book: h2h.bookmaker.title || h2h.bookmaker.key || 'Sportsbook board',
            updatedAt: game.updated_at || h2h.bookmaker.last_update || null,
            awayPrice: awayOutcome.price,
            homePrice: homeOutcome.price,
            total: totalOutcome && totalOutcome.point != null ? totalOutcome.point : null
        };
    }
    function impliedFromAmerican(price) {
        var n = Number(price);
        if (!Number.isFinite(n) || n === 0) return null;
        return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
    }
    function selectedLiveContext(away, home) {
        if (!away || !home || away.era !== 'current' || home.era !== 'current') return null;
        var espnGame = (state.liveContext.espnEvents || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var scheduleGame = (state.liveContext.scheduleGames || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var boardGame = (state.liveContext.boardGames || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var recentForm = buildRecentForm(away, home);
        var summary = summaryForEvent(espnGame && espnGame.id);
        var extraContext = summaryContext(summary, away, home);
        if (!espnGame && !scheduleGame && !boardGame && !recentForm && !extraContext) return null;
        var odds = boardGame ? marketOddsFor(boardGame, away, home) : null;
        return { espnGame: espnGame, scheduleGame: scheduleGame, boardGame: boardGame, odds: odds, recentForm: recentForm, summary: summary, extraContext: extraContext };
    }
    function completedTeamResult(event, team) {
        if (!event || !event.completed || !team) return null;
        var isAway = normalizeName(event.awayTeam) === normalizeName(team.name);
        var isHome = normalizeName(event.homeTeam) === normalizeName(team.name);
        if (!isAway && !isHome) return null;
        var scored = isAway ? event.awayScore : event.homeScore;
        var allowed = isAway ? event.homeScore : event.awayScore;
        if (!Number.isFinite(scored) || !Number.isFinite(allowed)) return null;
        return {
            date: event.commenceTime,
            opponent: isAway ? event.homeTeam : event.awayTeam,
            scored: scored,
            allowed: allowed,
            won: scored > allowed,
            differential: scored - allowed
        };
    }
    function recentForTeam(team) {
        var games = (state.liveContext.recentEvents || [])
            .map(function (event) { return completedTeamResult(event, team); })
            .filter(Boolean)
            .sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); })
            .slice(0, 5);
        if (!games.length) return null;
        var wins = games.filter(function (game) { return game.won; }).length;
        var runsFor = games.reduce(function (sum, game) { return sum + game.scored; }, 0);
        var runsAgainst = games.reduce(function (sum, game) { return sum + game.allowed; }, 0);
        return {
            games: games.length,
            wins: wins,
            losses: games.length - wins,
            runsFor: runsFor,
            runsAgainst: runsAgainst,
            runDiff: runsFor - runsAgainst,
            avgFor: round1(runsFor / games.length),
            avgAgainst: round1(runsAgainst / games.length),
            summary: wins + '-' + (games.length - wins) + ', ' + (runsFor - runsAgainst >= 0 ? '+' : '') + (runsFor - runsAgainst) + ' run diff'
        };
    }
    function buildRecentForm(away, home) {
        var awayForm = recentForTeam(away);
        var homeForm = recentForTeam(home);
        if (!awayForm && !homeForm) return null;
        return { away: awayForm, home: homeForm };
    }
    function liveInputsForContext(context) {
        var espnGame = context && context.espnGame;
        var scheduleGame = context && context.scheduleGame;
        var odds = context && context.odds;
        var recentForm = context && context.recentForm;
        var extra = context && context.extraContext;
        var weather = espnGame && espnGame.weather;
        var injuryAvailable = !!(extra && extra.injuries && (extra.injuries.away || extra.injuries.home));
        var rosterAvailable = !!(extra && extra.rosters && extra.rosters.away && extra.rosters.home);
        var bullpenAvailable = !!(extra && ((extra.injuries && ((extra.injuries.away && extra.injuries.away.relieverCount) || (extra.injuries.home && extra.injuries.home.relieverCount))) || (extra.rosters && extra.rosters.away && extra.rosters.home && (extra.rosters.away.relievers || extra.rosters.home.relievers))));
        var startersAvailable = !!(espnGame && espnGame.awayStarter && espnGame.homeStarter);
        var recordsAvailable = !!(espnGame && espnGame.awayRecord && espnGame.homeRecord);
        var recentAvailable = !!(recentForm && recentForm.away && recentForm.home);
        return [
            {
                key: 'scheduleFinals',
                label: 'MLB schedule/finals',
                verified: !!(espnGame || scheduleGame),
                status: (espnGame || scheduleGame) ? ((espnGame && espnGame.completed) || (scheduleGame && scheduleGame.completed) ? 'Final score available' : 'Scheduled game found') : 'Unavailable',
                detail: (espnGame && espnGame.statusDetail) || (scheduleGame && scheduleGame.commence_time ? 'Scheduled ' + new Date(scheduleGame.commence_time).toLocaleString() : 'No matching current MLB game found.')
            },
            {
                key: 'teamRecords',
                label: 'Team records',
                verified: recordsAvailable,
                status: recordsAvailable ? 'Available from ESPN scoreboard' : 'Unavailable',
                detail: recordsAvailable ? espnGame.awayTeam + ' ' + espnGame.awayRecord.summary + ' / ' + espnGame.homeTeam + ' ' + espnGame.homeRecord.summary : 'No verified record match available.'
            },
            {
                key: 'startingPitchers',
                label: 'Probable starters',
                verified: startersAvailable,
                status: startersAvailable ? 'Probable starters available' : 'Unavailable',
                detail: startersAvailable ? espnGame.awayStarter.name + ' vs ' + espnGame.homeStarter.name : 'No confirmed or probable starter match available.'
            },
            {
                key: 'confirmedStarters',
                label: 'Confirmed starter status',
                verified: false,
                status: 'Unavailable',
                detail: startersAvailable ? 'ESPN lists probable starters; confirmed starter status is not connected.' : 'No confirmed starter status match available.'
            },
            {
                key: 'ballpark',
                label: 'Ballpark',
                verified: !!(espnGame && espnGame.venue),
                status: espnGame && espnGame.venue ? 'Ballpark available' : 'Unavailable',
                detail: espnGame && espnGame.venue ? espnGame.venue.name + (espnGame.venue.city ? ', ' + espnGame.venue.city : '') + '.' : 'No verified venue match available.'
            },
            {
                key: 'weather',
                label: 'Weather',
                verified: !!weather,
                status: weather ? 'Available from ESPN scoreboard' : 'Unavailable',
                detail: weather ? [weather.temperature != null ? weather.temperature + 'F' : '', weather.display || '', Number.isFinite(weather.gust) ? 'gust ' + weather.gust + ' mph' : ''].filter(Boolean).join(' / ') : 'No verified weather match available.'
            },
            {
                key: 'sportsbookOdds',
                label: 'Sportsbook odds',
                verified: !!odds,
                status: odds ? 'Available from backend board' : 'Unavailable',
                detail: odds ? odds.book + ' moneyline snapshot; used as market context, not a betting edge.' : 'No verified sportsbook odds match available.'
            },
            {
                key: 'injuryReport',
                label: 'Injury report',
                verified: injuryAvailable,
                status: injuryAvailable ? 'Available from ESPN summary' : 'Unavailable',
                detail: injuryAvailable ? [extra.injuries.away ? espnGame.awayTeam + ': ' + extra.injuries.away.summary : espnGame.awayTeam + ': none listed', extra.injuries.home ? espnGame.homeTeam + ': ' + extra.injuries.home.summary : espnGame.homeTeam + ': none listed'].join(' / ') : 'No verified injury report match available.'
            },
            {
                key: 'recentForm',
                label: 'Recent scoring form',
                status: recentAvailable ? 'Available from ESPN final scores' : 'Unavailable',
                detail: recentAvailable ? 'Last ' + recentForm.away.games + ': ' + recentForm.away.summary + ' / Last ' + recentForm.home.games + ': ' + recentForm.home.summary : 'No verified recent final-score sample matched both teams.',
                verified: recentAvailable
            },
            { key: 'rosterContext', label: 'Roster context', status: rosterAvailable ? 'Available from active roster payload' : 'Unavailable', detail: rosterAvailable ? espnGame.awayTeam + ': ' + extra.rosters.away.summary + ' / ' + espnGame.homeTeam + ': ' + extra.rosters.home.summary : 'No verified player roster list is connected for this matchup.', verified: rosterAvailable },
            backendProjectionInputStatus(),
            { key: 'bullpenContext', label: 'Bullpen context', status: bullpenAvailable ? 'Bullpen injury/depth context available' : 'Unavailable', detail: bullpenAvailable ? 'Derived from ESPN roster/injury context only; workload and availability are not connected.' : 'No verified bullpen depth, workload, or availability feed is connected.', verified: bullpenAvailable },
            (function () {
                var sc = state.liveContext && state.liveContext.statcast;
                var n = sc ? (Object.keys(sc.batter || {}).length + Object.keys(sc.pitcher || {}).length) : 0;
                return { key: 'statcast', label: 'Statcast expected stats', status: n ? 'Available from Baseball Savant' : 'Unavailable', detail: n ? ('Real ' + seasonYear() + ' Statcast expected stats (xwOBA / xERA) loaded for ' + n + ' qualified players.') : 'No Baseball Savant expected-stats feed is connected.', verified: !!n };
            })()
        ];
    }
    function backendProjectionInputStatus() {
        var status = state.backendProjectionStatus;
        if (!status) {
            return { key: 'backendProjection', label: 'Backend live projection', status: 'Not checked', detail: 'Checked after selecting a live board matchup and running the simulator.', verified: false };
        }
        if (status.available) {
            return { key: 'backendProjection', label: 'Backend live projection', status: 'Available', detail: 'Backend projection returned complete source-backed model inputs.', verified: true };
        }
        if (status.reason === 'missing_config') {
            return { key: 'backendProjection', label: 'Backend live projection', status: 'Unavailable', detail: 'Missing backend config: ' + status.missingEnv.join(', ') + '. No backend projection is displayed.', verified: false };
        }
        if (status.reason === 'insufficient_data') {
            return { key: 'backendProjection', label: 'Backend live projection', status: 'Insufficient data', detail: status.detail || 'Backend returned insufficient_data; no backend projection is displayed.', verified: false };
        }
        return { key: 'backendProjection', label: 'Backend live projection', status: 'Unavailable', detail: status.detail || 'Backend live projection is unavailable. No backend projection is displayed.', verified: false };
    }
    function backendProjectionSummary() {
        var status = backendProjectionInputStatus();
        return status.status + ': ' + status.detail;
    }
    function setLiveInputsForMatchup(away, home) {
        state.activeLiveContext = selectedLiveContext(away, home);
        var boardId = state.activeLiveContext && state.activeLiveContext.boardGame && state.activeLiveContext.boardGame.id || null;
        if (state.backendProjectionStatus && state.backendProjectionStatus.gameId !== boardId) state.backendProjectionStatus = null;
        state.liveInputs = liveInputsForContext(state.activeLiveContext);
        state.dataMode = verifiedLiveInputs().length ? 'live' : 'baseline';
    }
    function normalizeBackendProjectionStatus(payload) {
        var provider = payload && payload.provider_status || {};
        var projection = payload && payload.projection || {};
        return {
            checked: true,
            available: !!(projection && projection.projection_available && provider.available),
            reason: provider.reason || (projection.status === 'insufficient_data' ? 'insufficient_data' : null),
            missingEnv: Array.isArray(provider.missing_env) ? provider.missing_env : [],
            gameId: payload && payload.game_id || null,
            gameSource: payload && payload.game_source || null,
            projectionStatus: projection.status || null,
            detail: projection.explanation && projection.explanation.missing_data && Array.isArray(projection.explanation.missing_data.required_missing)
                ? 'Missing model inputs: ' + projection.explanation.missing_data.required_missing.join(', ')
                : ''
        };
    }
    function fetchBackendProjectionStatus(context) {
        var boardGame = context && context.boardGame;
        if (!boardGame || !boardGame.id) {
            state.backendProjectionStatus = null;
            return Promise.resolve(null);
        }
        return fetchJson(apiBaseUrl().replace(/\/+$/, '') + '/mlb-simulator/mlb/projection/' + encodeURIComponent(boardGame.id), { cache: 'no-store' })
            .then(function (payload) {
                state.backendProjectionStatus = normalizeBackendProjectionStatus(payload);
                state.liveInputs = liveInputsForContext(state.activeLiveContext);
                state.dataMode = verifiedLiveInputs().length ? 'live' : 'baseline';
                renderDataModeStatus();
                return state.backendProjectionStatus;
            })
            .catch(function (error) {
                state.backendProjectionStatus = { checked: true, available: false, reason: 'request_failed', missingEnv: [], gameId: boardGame.id, detail: error && error.message || 'Backend projection request failed.' };
                state.liveInputs = liveInputsForContext(state.activeLiveContext);
                state.dataMode = verifiedLiveInputs().length ? 'live' : 'baseline';
                renderDataModeStatus();
                return state.backendProjectionStatus;
            });
    }

    // STATCAST_PROJECTION_20260624 (Phase 6b): regress a starter's results-based ERA
    // toward his Statcast xERA, which strips luck/sequencing and is more predictive of
    // future run prevention. Population-centered (xERA ~ ERA league-wide) so it shifts
    // individual matchups toward true talent without moving league-average runs. Falls
    // back to raw ERA when the pitcher has no qualified Statcast line.
    function effectivePitcherEra(starter) {
        var era = Number(starter && starter.era);
        if (!Number.isFinite(era)) return null;
        var sc = starter && starter.mlbId ? cachedStatcast(starter.mlbId, 'pitcher') : null;
        if (sc && Number.isFinite(sc.xera) && sc.xera > 0) return era * 0.55 + sc.xera * 0.45;
        return era;
    }
    function starterEraAdjustment(starter) {
        var era = effectivePitcherEra(starter);
        if (!Number.isFinite(era)) return 0;
        return clamp((era - 4.2) * 0.16, -0.32, 0.48);
    }
    function selectedPitcherRunAdjustment(pitcher) {
        if (!pitcher) return 0;
        return clamp((100 - pitcher.quality) * 0.022, -0.45, 0.48);
    }
    function selectedPitcherStrengthAdjustment(pitcher) {
        if (!pitcher) return 0;
        return clamp((pitcher.quality - 100) * 0.24, -4.2, 5.4);
    }
    function recordStrengthAdjustment(record) {
        if (!record || !Number.isFinite(record.pct)) return 0;
        return clamp((record.pct - 0.5) * 9, -3.5, 3.5);
    }
    function injuryStrengthPenalty(report) {
        if (!report) return 0;
        return clamp((report.ilCount * 0.32) + (report.dayToDay * 0.12) + (report.relieverCount * 0.12), 0, 2.8);
    }
    function simulate(away, home, context, seedSalt, allowUpset) {
        // Home-field run environment (Layer 3 calibration). HOME_FIELD_HOME_BONUS +
        // HOME_FIELD_AWAY_BONUS is held CONSTANT (= 0.32) so total runs/game and
        // league runs/team are unchanged; only the home/away split shifts. Shifting
        // toward home raises the simulated home win % toward the real 2025 baseline
        // (54.3%) while keeping the realized home/away run gap near reality (real
        // 2025: home 4.489 vs away 4.404). Reaching the full 54.3% via runs alone
        // would over-inflate the split, so this targets the realistic split; the
        // residual home edge is a last-at-bat/leverage effect (future layer).
        var awayRuns = expectedRunsFor(away, home, HOME_FIELD_AWAY_BONUS);
        var homeRuns = expectedRunsFor(home, away, HOME_FIELD_HOME_BONUS);
        var liveFactors = [];
        var awayPitcherPre = selectedPitcher('away', away, context);
        var homePitcherPre = selectedPitcher('home', home, context);
        var homePitcherHand = homePitcherPre && homePitcherPre.mlbId ? pitchHandOf(homePitcherPre.mlbId) : null;
        var awayPitcherHand = awayPitcherPre && awayPitcherPre.mlbId ? pitchHandOf(awayPitcherPre.mlbId) : null;
        var awayOps = teamLiveOpsFactor(away, homePitcherHand);
        var homeOps = teamLiveOpsFactor(home, awayPitcherHand);
        if (awayOps) {
            awayRuns = clamp(awayRuns * awayOps.factor, 1.7, 9.4);
            liveFactors.push('Live offense from real ' + seasonYear() + ' hitter OPS' + (awayOps.vsHand && awayOps.splitCount ? (' vs ' + awayOps.vsHand + 'HP (' + awayOps.splitCount + ' of ' + awayOps.sampleSize + ' slots using split)') : '') + ': ' + away.abbreviation + ' top-9 mean OPS ' + awayOps.meanOps.toFixed(3) + ' applies a ' + Math.round((awayOps.factor - 1) * 100) + '% run-environment factor.');
        }
        if (homeOps) {
            homeRuns = clamp(homeRuns * homeOps.factor, 1.7, 9.4);
            liveFactors.push('Live offense from real ' + seasonYear() + ' hitter OPS' + (homeOps.vsHand && homeOps.splitCount ? (' vs ' + homeOps.vsHand + 'HP (' + homeOps.splitCount + ' of ' + homeOps.sampleSize + ' slots using split)') : '') + ': ' + home.abbreviation + ' top-9 mean OPS ' + homeOps.meanOps.toFixed(3) + ' applies a ' + Math.round((homeOps.factor - 1) * 100) + '% run-environment factor.');
        }
        var awayBullpen = teamLiveBullpenFactor(away);
        var homeBullpen = teamLiveBullpenFactor(home);
        function bullpenRateNote(label, factor) {
            var parts = [];
            if (Number.isFinite(factor.meanK9)) parts.push('K/9 ' + factor.meanK9.toFixed(2));
            if (Number.isFinite(factor.meanBb9)) parts.push('BB/9 ' + factor.meanBb9.toFixed(2));
            if (Number.isFinite(factor.meanHr9)) parts.push('HR/9 ' + factor.meanHr9.toFixed(2));
            return parts.length ? ' (' + parts.join(', ') + ')' : '';
        }
        if (homeBullpen) {
            awayRuns = clamp(awayRuns - homeBullpen.adjustment, 1.7, 9.4);
            liveFactors.push('Live bullpen from real ' + seasonYear() + ' reliever stats: ' + home.abbreviation + ' mean reliever ERA ' + homeBullpen.meanEra.toFixed(2) + bullpenRateNote('home', homeBullpen) + ' (n=' + homeBullpen.sampleSize + ') adjusts opponent runs by ' + (homeBullpen.adjustment > 0 ? '-' : '+') + Math.abs(homeBullpen.adjustment).toFixed(2) + '.');
        }
        if (awayBullpen) {
            homeRuns = clamp(homeRuns - awayBullpen.adjustment, 1.7, 9.4);
            liveFactors.push('Live bullpen from real ' + seasonYear() + ' reliever stats: ' + away.abbreviation + ' mean reliever ERA ' + awayBullpen.meanEra.toFixed(2) + bullpenRateNote('away', awayBullpen) + ' (n=' + awayBullpen.sampleSize + ') adjusts opponent runs by ' + (awayBullpen.adjustment > 0 ? '-' : '+') + Math.abs(awayBullpen.adjustment).toFixed(2) + '.');
        }
        var awayPitcher = awayPitcherPre;
        var homePitcher = homePitcherPre;
        awayRuns = clamp(awayRuns + selectedPitcherRunAdjustment(homePitcher), 1.9, 9.4);
        homeRuns = clamp(homeRuns + selectedPitcherRunAdjustment(awayPitcher), 1.9, 9.4);
        awayRuns = clamp(awayRuns + starterEraAdjustment(homePitcher), 1.8, 9.2);
        homeRuns = clamp(homeRuns + starterEraAdjustment(awayPitcher), 1.8, 9.2);
        var parkFactor = parkRunFactor(home);
        if (parkFactor !== 1) {
            awayRuns = clamp(awayRuns * parkFactor, 1.8, 9.2);
            homeRuns = clamp(homeRuns * parkFactor, 1.8, 9.2);
            liveFactors.push('Park factor: ' + home.name + ' home environment adjusts the run model by ' + Math.round((parkFactor - 1) * 100) + '%.');
        }
        // DEFENSE_OAA_20260624: each club's fielding (Statcast team OAA) suppresses or
        // inflates the opponent's expected runs. League-centered so it is calibration-
        // neutral; only applies when the Savant OAA feed loaded for the team.
        var awayDef = defenseRunAdjustment(home), homeDef = defenseRunAdjustment(away);
        if (awayDef !== 0) awayRuns = clamp(awayRuns + awayDef, 1.7, 9.4);
        if (homeDef !== 0) homeRuns = clamp(homeRuns + homeDef, 1.7, 9.4);
        if (awayDef !== 0 || homeDef !== 0) {
            liveFactors.push('Defense (Statcast team OAA ' + seasonYear() + '): ' + home.abbreviation + ' ' + (teamOaaFor(home) > 0 ? '+' : '') + teamOaaFor(home) + ' OAA, ' + away.abbreviation + ' ' + (teamOaaFor(away) > 0 ? '+' : '') + teamOaaFor(away) + ' OAA adjust opponent runs accordingly.');
        }
        var awayStrength = strength(away);
        var homeStrength = strength(home) + 1.7;
        awayStrength += selectedPitcherStrengthAdjustment(awayPitcher);
        homeStrength += selectedPitcherStrengthAdjustment(homePitcher);
        if (awayPitcher && homePitcher) {
            var awayHandLabel = awayPitcherHand ? ' (' + awayPitcherHand + 'HP)' : '';
            var homeHandLabel = homePitcherHand ? ' (' + homePitcherHand + 'HP)' : '';
            liveFactors.push('Starting Pitchers: ' + away.name + ': ' + awayPitcher.name + awayHandLabel + ' (' + awayPitcher.source + ', ' + (awayPitcher.verified ? 'verified probable' : 'modeled input') + '); ' + home.name + ': ' + homePitcher.name + homeHandLabel + ' (' + homePitcher.source + ', ' + (homePitcher.verified ? 'verified probable' : 'modeled input') + ').');
        }
        if (awayPitcher && homePitcher && Math.abs(awayPitcher.quality - homePitcher.quality) >= 7) {
            liveFactors.push('Starting pitching matchup: ' + (awayPitcher.quality > homePitcher.quality ? awayPitcher.name : homePitcher.name) + ' grades higher in this simulator profile and moves the run projection.');
        }
        if (context && context.espnGame) {
            awayStrength += recordStrengthAdjustment(context.espnGame.awayRecord);
            homeStrength += recordStrengthAdjustment(context.espnGame.homeRecord);
            if (context.espnGame.awayRecord && context.espnGame.homeRecord) {
                liveFactors.push('Team records: ' + away.abbreviation + ' ' + context.espnGame.awayRecord.summary + ', ' + home.abbreviation + ' ' + context.espnGame.homeRecord.summary + '.');
            }
            if (context.espnGame.venue) {
                liveFactors.push('Ballpark context: ' + context.espnGame.venue.name + ' is verified from ESPN.');
            }
            if (context.espnGame.weather) {
                var weather = context.espnGame.weather;
                var weatherAdjustment = weatherRunAdjustment(weather);
                awayRuns = clamp(awayRuns + weatherAdjustment, 1.8, 9.2);
                homeRuns = clamp(homeRuns + weatherAdjustment, 1.8, 9.2);
                liveFactors.push('Weather context from ESPN: ' + [weather.temperature != null ? weather.temperature + 'F' : '', weather.display || '', Number.isFinite(weather.gust) ? 'gust ' + weather.gust + ' mph' : ''].filter(Boolean).join(' / ') + '.');
            }
        }
        if (away && away.era === 'current' && home && home.era === 'current' && state.liveContext.todaySchedule && Array.isArray(state.liveContext.todaySchedule.games)) {
            var mlbGames = state.liveContext.todaySchedule.games;
            if (!context || !context.espnGame || !context.espnGame.weather) {
                var mlbWeather = todaysWeatherForTeam(mlbGames, home);
                if (mlbWeather) {
                    var mlbAdj = weatherRunAdjustment(mlbWeather);
                    awayRuns = clamp(awayRuns + mlbAdj, 1.8, 9.2);
                    homeRuns = clamp(homeRuns + mlbAdj, 1.8, 9.2);
                    liveFactors.push('Weather from MLB schedule: ' + [mlbWeather.temperature != null ? mlbWeather.temperature + 'F' : '', mlbWeather.display, mlbWeather.wind ? 'wind ' + mlbWeather.wind : ''].filter(Boolean).join(' / ') + '.');
                }
            }
            if (!context || !context.espnGame || !context.espnGame.venue) {
                var mlbVenue = todaysVenueForTeam(mlbGames, home);
                if (mlbVenue) liveFactors.push('Ballpark from MLB schedule: ' + mlbVenue.name + '.');
            }
            if (!context || !context.espnGame || !context.espnGame.awayRecord || !context.espnGame.homeRecord) {
                var awayRec = todaysRecordForTeam(mlbGames, away);
                var homeRec = todaysRecordForTeam(mlbGames, home);
                if (awayRec) awayStrength += recordStrengthAdjustment(awayRec);
                if (homeRec) homeStrength += recordStrengthAdjustment(homeRec);
                if (awayRec && homeRec) {
                    liveFactors.push('Team records from MLB schedule: ' + away.abbreviation + ' ' + awayRec.summary + ' (' + (awayRec.pct * 100).toFixed(1) + '%), ' + home.abbreviation + ' ' + homeRec.summary + ' (' + (homeRec.pct * 100).toFixed(1) + '%).');
                }
            }
        }
        if (context && context.extraContext && context.extraContext.injuries) {
            var awayInjuries = context.extraContext.injuries.away;
            var homeInjuries = context.extraContext.injuries.home;
            if (awayInjuries) awayStrength -= injuryStrengthPenalty(awayInjuries);
            if (homeInjuries) homeStrength -= injuryStrengthPenalty(homeInjuries);
            if (awayInjuries || homeInjuries) {
                liveFactors.push('ESPN injury report: ' + away.abbreviation + ' ' + (awayInjuries ? awayInjuries.summary : 'none listed') + '; ' + home.abbreviation + ' ' + (homeInjuries ? homeInjuries.summary : 'none listed') + '.');
            }
        }
        if (away && away.era === 'current' && home && home.era === 'current' && state.liveContext.teamInjured) {
            var awayInj = state.liveContext.teamInjured[away.abbreviation];
            var homeInj = state.liveContext.teamInjured[home.abbreviation];
            function injSummary(list) {
                if (!Array.isArray(list) || !list.length) return null;
                var short = list.filter(function (p) { return /\b(7|10|15)-Day\b/i.test(p.status); });
                var bucket = short.length ? short : list;
                var top = bucket.slice(0, 3).map(function (p) { return p.name + ' (' + p.position + ', ' + p.status + ')'; });
                return bucket.length + ' listed: ' + top.join('; ') + (bucket.length > 3 ? '; ...' : '');
            }
            var awayInjLine = injSummary(awayInj);
            var homeInjLine = injSummary(homeInj);
            if (awayInjLine || homeInjLine) {
                liveFactors.push('MLB injury list: ' + away.abbreviation + ' ' + (awayInjLine || 'none current') + '; ' + home.abbreviation + ' ' + (homeInjLine || 'none current') + '.');
            }
        }
        if (context && context.extraContext && context.extraContext.rosters && context.extraContext.rosters.away && context.extraContext.rosters.home) {
            liveFactors.push('ESPN summary roster context was detected but is not used for current-team player rows; player identities require the MLB active roster endpoint.');
        }
        if (context && context.extraContext && context.extraContext.injuries && ((context.extraContext.injuries.away && context.extraContext.injuries.away.relieverCount) || (context.extraContext.injuries.home && context.extraContext.injuries.home.relieverCount))) {
            liveFactors.push('Bullpen context is limited to reliever injury listings; live workload and availability are not connected.');
        }
        if (context && context.recentForm) {
            if (context.recentForm.away) {
                awayRuns = clamp(awayRuns + clamp((context.recentForm.away.avgFor - 4.4) * 0.08, -0.28, 0.28), 1.7, 9.2);
                awayStrength += clamp(context.recentForm.away.runDiff * 0.12, -2.5, 2.5);
            }
            if (context.recentForm.home) {
                homeRuns = clamp(homeRuns + clamp((context.recentForm.home.avgFor - 4.4) * 0.08, -0.28, 0.28), 1.7, 9.2);
                homeStrength += clamp(context.recentForm.home.runDiff * 0.12, -2.5, 2.5);
            }
            if (context.recentForm.away && context.recentForm.home) {
                liveFactors.push('Recent scoring form from ESPN finals: ' + away.abbreviation + ' ' + context.recentForm.away.summary + '; ' + home.abbreviation + ' ' + context.recentForm.home.summary + '.');
            }
        }
        // Real MLB single-game win probability almost never leaves ~[0.30, 0.70];
        // even the best vs worst club tops out near 68%. Blend a gentle logistic
        // (team-strength driven) with a Pythagorean expectation from the projected
        // run environment so the displayed win % tracks the simulated box scores
        // instead of drifting away from them, then clamp to a realistic band.
        var homeLogistic = 1 / (1 + Math.exp(-(((homeRuns - awayRuns) * 0.42) + ((homeStrength - awayStrength) * 0.020))));
        var homePythagExp = Math.pow(homeRuns, 1.83);
        var awayPythagExp = Math.pow(awayRuns, 1.83);
        var homePythag = (homePythagExp + awayPythagExp) > 0 ? homePythagExp / (homePythagExp + awayPythagExp) : 0.5;
        var homeWin = clamp((homeLogistic * 0.5) + (homePythag * 0.5), 0.28, 0.72);
        // MODEL_VS_MARKET_20260623: capture the no-vig market-implied win % (research
        // context only, never presented as a betting edge).
        var marketWin = null;
        if (context && context.odds) {
            var awayImp = impliedFromAmerican(context.odds.awayPrice);
            var homeImp = impliedFromAmerican(context.odds.homePrice);
            if (awayImp != null && homeImp != null) {
                var noVigHome = homeImp / (homeImp + awayImp);
                marketWin = { awayPct: awayImp / (awayImp + homeImp), homePct: noVigHome, book: context.odds.book, awayPrice: context.odds.awayPrice, homePrice: context.odds.homePrice };
                homeWin = clamp((homeWin * 0.85) + (noVigHome * 0.15), 0.17, 0.83);
                liveFactors.push('Market context: ' + context.odds.book + ' moneyline snapshot is included, but no betting edge is claimed.');
            }
            if (context.odds.total != null) {
                var calibrated = applyMarketTotalCalibration(awayRuns, homeRuns, context.odds.total, awayStrength / (awayStrength + homeStrength));
                awayRuns = calibrated.awayRuns;
                homeRuns = calibrated.homeRuns;
                liveFactors.push('Market total snapshot: ' + context.odds.total + ' runs.');
                if (calibrated.applied) liveFactors.push('Run environment calibration: sportsbook total is used only to anchor the scoring environment, not to create a betting edge.');
            }
        }
        var volatility = clamp((away.volatility + home.volatility) / 2, 0.92, 1.16);
        var spread = round1(1.1 * volatility);
        var totalRuns = awayRuns + homeRuns;
        var rosterContext = rostersForTeams(away, home, context);
        // REAL_TOTAL_RECENTER_20260629: on REAL matchups (live season data loaded) the
        // stacked live adjustments (OPS, pitcher true-talent regression, park, defense)
        // net ~+0.35 runs hot vs actual scoring (backtest n=60: pred 9.50 vs actual 9.15,
        // season 8.96). Scale both clubs equally so the total recenters toward reality
        // while the calibrated run DIFFERENCE (and win %) is untouched. Gated on real
        // season data, so synthetic teams / the offline calibration gate are unaffected.
        if (teamSeasonPythag(away) != null && teamSeasonPythag(home) != null) {
            awayRuns = clamp(awayRuns * 0.955, 1.6, 9.4);
            homeRuns = clamp(homeRuns * 0.955, 1.6, 9.4);
        }
        // REAL_RSRA_BLEND_20260630: blend each club's expected runs toward the matchup-runs
        // estimate from REAL pre-game season RS/RA (oRS/g * dRA/g / leagueRS/g). The
        // OPS+ratings run model under/over-rated several teams' offense vs their actual
        // scoring (team-reproduction audit: MIA -1.0 RS/g, PIT -1.2, LAD +0.8). This pulls
        // team run output toward reality while the engine term keeps the selected-starter
        // matchup. Data = state.liveContext.teamSeason (pre-game season-to-date: current
        // standings live; injected as-of-game-date in backtest -> no look-ahead). Gated on
        // real season data so the synthetic-team calibration gate is unaffected.
        var rExpA = teamRealRunExp(away, home), rExpH = teamRealRunExp(home, away);
        if (rExpA != null && rExpH != null) {
            var RSRA_W = (typeof window !== 'undefined' && window.__RSRA_W != null) ? window.__RSRA_W : 0.40;
            awayRuns = clamp(awayRuns * (1 - RSRA_W) + rExpA * RSRA_W, 1.6, 9.4);
            homeRuns = clamp(homeRuns * (1 - RSRA_W) + rExpH * RSRA_W, 1.6, 9.4);
        }
        var eventInputs = buildEventInputs(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, rosterContext);
        // Win probability is the simulated frequency from the same plate-appearance
        // engine that produces the box score, so the displayed win % and the box
        // scores are one consistent model. The run-based blend above is the fallback.
        // WP_PRECISION_20260622: a single 90/300-game sample carries ~3-5% Bernoulli
        // sampling error, so the displayed win % visibly wobbled between identical
        // runs. The PA engine is cheap, so sample far more games (single run 2000,
        // batched aggregate runs 200) to cut that standard error to ~1%. This only
        // sharpens the win-probability estimate; it does not change the box score or
        // run model, so calibration is unaffected.
        var wpSamples = state.simulationCount > 1 ? 200 : 2000;
        var simStats = {};
        var simHomeWin = eventWinProbability(eventInputs, wpSamples, simStats);
        homeWin = clamp(Number.isFinite(simHomeWin) ? simHomeWin : homeWin, 0.05, 0.95);
        // TEAM_TRUE_TALENT_20260629: regularize the simulated win % toward a real
        // season run-differential prior (log5 of the two clubs' Pythagorean win
        // expectations + home edge). The PA-engine frequency stays dominant (75/25); the
        // prior pulls in true talent the single-game starter matchup can miss. Synthetic
        // teams (offline gate) have no season data, so this is calibration-neutral.
        var awaySeas = teamSeasonPythag(away), homeSeas = teamSeasonPythag(home);
        if (awaySeas != null && homeSeas != null) {
            var denomS = homeSeas + awaySeas - 2 * homeSeas * awaySeas;
            var l5 = denomS > 0 ? (homeSeas - homeSeas * awaySeas) / denomS : 0.5;
            l5 = clamp(l5 + 0.035, 0.20, 0.80);
            homeWin = clamp(homeWin * 0.70 + l5 * 0.30, 0.05, 0.95);
            liveFactors.push('Season run-differential prior: ' + home.abbreviation + ' Pyth ' + Math.round(homeSeas * 100) + '% vs ' + away.abbreviation + ' ' + Math.round(awaySeas * 100) + '% regularizes the win probability toward true talent.');
        }
        // EXPECTED_RUNS_CONSISTENCY_20260623: align the DISPLAYED expected runs (and the
        // score range, total, and run environment that derive from them) with the actual
        // mean of the simulated box scores from the same plate-appearance engine. The
        // separate run-projection model that seeds the anchor runs ~0.3/team above the
        // realized sim mean on real rosters, so the headline number used to disagree with
        // the box score below it. The box score itself is unchanged (it is anchored to
        // eventInputs); only the reported summary is reconciled to what was simulated.
        if (Number.isFinite(simStats.awayMean) && Number.isFinite(simStats.homeMean)) {
            awayRuns = clamp(simStats.awayMean, 1.6, 9.4);
            homeRuns = clamp(simStats.homeMean, 1.6, 9.4);
            totalRuns = awayRuns + homeRuns;
        }
        var awayWin = 1 - homeWin;
        var winner = homeWin >= awayWin ? home : away;
        var winnerPct = Math.max(homeWin, awayWin);
        var boxScore = buildBoxScore(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, awayWin, homeWin, seedSalt, allowUpset, rosterContext, eventInputs);
        var projectedAwayScore = boxScore.away.runs;
        var projectedHomeScore = boxScore.home.runs;
        var finalWinner = boxScore.winner;
        var reasonParts = [];
        reasonParts.push(winner.name + ' projects ahead because the run expectation and composite team rating lean their way.');
        if (Math.abs(away.offense - home.offense) >= 4) reasonParts.push(edgeLabel('offense', away, home) + ' on offense.');
        if (Math.abs(away.startingPitching - home.startingPitching) >= 4) reasonParts.push(edgeLabel('startingPitching', away, home) + ' in starting pitching.');
        if (Math.abs(away.bullpen - home.bullpen) >= 4) reasonParts.push(edgeLabel('bullpen', away, home) + ' in bullpen baseline.');
        if (awayPitcher && homePitcher) reasonParts.push('Selected starters: ' + awayPitcher.name + ' vs ' + homePitcher.name + '.');
        return {
            status: 'estimated',
            away: away,
            home: home,
            winner: winner,
            winnerPct: winnerPct,
            awayWin: awayWin,
            homeWin: homeWin,
            marketWin: marketWin,
            awayRuns: round1(awayRuns),
            homeRuns: round1(homeRuns),
            projectedAwayScore: projectedAwayScore,
            projectedHomeScore: projectedHomeScore,
            finalWinner: finalWinner,
            boxScore: boxScore,
            awayRange: [round1(Math.max(0.5, awayRuns - spread)), round1(awayRuns + spread)],
            homeRange: [round1(Math.max(0.5, homeRuns - spread)), round1(homeRuns + spread)],
            totalRange: [round1(Math.max(2, totalRuns - spread * 1.35)), round1(totalRuns + spread * 1.35)],
            runEnvironment: totalRuns >= 9.8 ? 'Elevated' : (totalRuns <= 7.4 ? 'Suppressed' : 'Balanced'),
            volatility: volatilityLabel(volatility),
            strengthGap: round1(Math.abs(homeStrength - awayStrength)),
            confidence: confidenceLabel(winnerPct, Math.abs(homeStrength - awayStrength)),
            confidenceBand: confidenceLabel(winnerPct, Math.abs(homeStrength - awayStrength)),
            eraAdjustment: eraAdjustmentNote(away, home),
            simulationMode: simulationModeLabel(),
            dataMode: dataModeLabel(),
            dataLimitations: dataModeDetail(),
            dataSourcesUsed: verifiedLiveInputs().map(function (source) { return source.label; }),
            missingDataSources: state.liveInputs.filter(function (source) { return !source.verified; }).map(function (source) { return source.label; }),
            liveFactors: liveFactors,
            offensiveEdge: edgeLabel('offense', away, home),
            pitchingEdge: edgeLabel('startingPitching', away, home),
            runPreventionEdge: edgeLabel('runPrevention', away, home),
            bullpenEdge: edgeLabel('bullpen', away, home),
            keyExplanation: reasonParts.join(' '),
            awayPitcher: awayPitcher,
            homePitcher: homePitcher
        };
    }

    function teamOption(team) {
        return '<option value="' + escapeHtml(team.id) + '">' + escapeHtml(team.name) + '</option>';
    }
    function ensurePitcherSelection(side, team, context) {
        var options = pitcherOptionsFor(team, side, context);
        var key = side === 'away' ? 'awayPitcherId' : 'homePitcherId';
        var touchedKey = side === 'away' ? 'awayPitcherTouched' : 'homePitcherTouched';
        if (!options.length) {
            state[key] = '';
            return null;
        }
        if (!options.filter(function (pitcher) { return pitcher.id === state[key]; })[0] || (!state[touchedKey] && options[0].verified)) state[key] = options[0].id;
        return options;
    }
    function renderPitcherOptions(side, team, context) {
        var options = ensurePitcherSelection(side, team, context) || [];
        var select = byId(side === 'away' ? 'awayPitcherSelect' : 'homePitcherSelect');
        var meta = byId(side === 'away' ? 'awayPitcherMeta' : 'homePitcherMeta');
        var key = side === 'away' ? 'awayPitcherId' : 'homePitcherId';
        var pitcher = selectedPitcher(side, team, context);
        if (select) {
            select.innerHTML = options.length ? options.map(function (option) { return pitcherOptionTag(option, option.id === state[key]); }).join('') : '<option value="">Starting pitcher list unavailable</option>';
            select.value = state[key] || '';
            select.disabled = !options.length;
        }
        if (meta) meta.textContent = pitcherMeta(pitcher);
    }

    function renderSelectors() {
        var awayTeams = poolTeams(state.awayPool);
        var homeTeams = poolTeams(state.homePool);
        if (!findTeamInPool(state.awayTeamId, state.awayPool)) state.awayTeamId = awayTeams[0] ? awayTeams[0].id : '';
        if (!findTeamInPool(state.homeTeamId, state.homePool)) state.homeTeamId = homeTeams[1] ? homeTeams[1].id : (homeTeams[0] ? homeTeams[0].id : '');
        if (state.awayTeamId === state.homeTeamId && homeTeams.length > 1) state.homeTeamId = homeTeams.filter(function (team) { return team.id !== state.awayTeamId; })[0].id;

        var awayPoolSelect = byId('awayPoolSelect');
        var homePoolSelect = byId('homePoolSelect');
        var awaySelect = byId('awayTeamSelect');
        var homeSelect = byId('homeTeamSelect');
        if (awayPoolSelect) awayPoolSelect.value = state.awayPool;
        if (homePoolSelect) homePoolSelect.value = state.homePool;
        if (awaySelect) {
            awaySelect.disabled = false;
            awaySelect.innerHTML = awayTeams.map(teamOption).join('');
            awaySelect.value = state.awayTeamId;
        }
        if (homeSelect) {
            homeSelect.disabled = false;
            homeSelect.innerHTML = homeTeams.map(teamOption).join('');
            homeSelect.value = state.homeTeamId;
        }

        var away = findTeamInPool(state.awayTeamId, state.awayPool);
        var home = findTeamInPool(state.homeTeamId, state.homePool);
        setLiveInputsForMatchup(away, home);
        renderPitcherOptions('away', away, state.activeLiveContext);
        renderPitcherOptions('home', home, state.activeLiveContext);
        renderTeamIdentity('awayPickerIdentity', away, 'Team A');
        renderTeamIdentity('homePickerIdentity', home, 'Team B');
        setLogo('awayHeaderLogo', away, 'header-logo');
        setLogo('homeHeaderLogo', home, 'header-logo');
        setLogo('awayScoreLogo', away, 'score-logo');
        setLogo('homeScoreLogo', home, 'score-logo');
        applyAccent('awayPickerIdentity', away);
        applyAccent('homePickerIdentity', home);
        applyAccent('resultCard', away);
        setText('awayTeamMeta', teamMeta(away));
        setText('homeTeamMeta', teamMeta(home));
        setText('selectedMatchupTitle', away && home ? away.name + ' vs ' + home.name : 'Choose two teams');
        setText('awayHeaderName', away ? away.name : 'Select Team A');
        setText('homeHeaderName', home ? home.name : 'Select Team B');
        setText('awayHeaderMeta', teamMeta(away));
        setText('homeHeaderMeta', teamMeta(home));
        setText('awayEraBadge', eraLabel(away));
        setText('homeEraBadge', eraLabel(home));
        renderDataModeStatus();
        setText('simBoardMessage', 'Baseline simulator loaded: Team A has ' + awayTeams.length + ' ' + (state.awayPool === 'historical' ? 'classic' : 'current') + ' teams; Team B has ' + homeTeams.length + ' ' + (state.homePool === 'historical' ? 'classic' : 'current') + ' teams.');
        setText('modeHelpText', modeHelpText());

        var run = byId('runSimulationButton');
        if (run) run.disabled = !(away && home && away.id !== home.id);
        var current = byId('currentModeButton');
        var historical = byId('historicalModeButton');
        var mixed = byId('mixedModeButton');
        if (current) current.classList.toggle('active', state.preset === 'current');
        if (historical) historical.classList.toggle('active', state.preset === 'historical');
        if (mixed) mixed.classList.toggle('active', state.preset === 'mixed');
    }

    function liveDataUpdatedAt() {
        var newest = 0;
        function consider(v) {
            if (v === undefined || v === null) return;
            var t = typeof v === 'number' ? v : new Date(v).getTime();
            if (Number.isFinite(t) && t > newest) newest = t;
        }
        [state.liveContext, state.activeLiveContext].forEach(function (ctx) {
            if (!ctx) return;
            consider(ctx.loadedAt);
            consider(ctx.todaySchedule && ctx.todaySchedule.fetchedAt);
            var rosters = ctx.teamRosters;
            if (rosters) Object.keys(rosters).forEach(function (k) {
                consider(rosters[k] && rosters[k].fetchedAt);
            });
        });
        return newest > 0 ? newest : null;
    }
    function liveDataUpdatedLabel() {
        var ts = liveDataUpdatedAt();
        if (!ts) return '';
        try { return 'MLB roster/schedule data last updated ' + new Date(ts).toLocaleString() + '.'; }
        catch (e) { return ''; }
    }
    function renderDataModeStatus() {
        var verifiedCount = verifiedLiveInputs().length;
        var updated = liveDataUpdatedLabel();
        setText('simDataSourceTitle', verifiedCount ? 'Verified input mode' : 'Baseline ratings mode');
        setText('simDataSourceDetail', (verifiedCount ? 'Using verified live inputs where available plus baseline ratings.' : 'Using internal baseline team ratings and historical context only.') + (updated ? ' ' + updated : ''));
        setText('dataModeBadge', dataModeLabel());
        setText('dataModeDetail', dataModeDetail());
        var grid = byId('liveInputGrid');
        if (!grid) return;
        var verified = verifiedLiveInputs();
        if (!verified.length) {
            grid.innerHTML = '<div class="data-note-line">Verified live inputs appear when available. This simulator currently uses baseline team and starter profiles when verified live feeds are unavailable.</div>';
            return;
        }
        grid.innerHTML = '<div class="data-note-line"><strong>Verified sources used:</strong> ' + escapeHtml(verified.map(function (source) { return source.label; }).join(', ')) + '. Missing live feeds are not guessed or displayed as facts.</div>';
    }

    function renderComparison(result) {
        var container = byId('comparisonGrid');
        if (!container) return;
        if (!result) {
            container.innerHTML = '<div class="sim-empty">Run a simulation to compare team strength, offense, pitching/run prevention, and volatility.</div>';
            return;
        }
        var rows = [
            ['Overall Strength', Math.round(strength(result.away)), Math.round(strength(result.home))],
            ['Offense', result.away.offense, result.home.offense],
            ['Run Prevention', result.away.runPrevention, result.home.runPrevention],
            ['Starting Pitching', result.away.startingPitching, result.home.startingPitching],
            ['Bullpen', result.away.bullpen, result.home.bullpen],
            ['Volatility', Math.round(result.away.volatility * 100), Math.round(result.home.volatility * 100)]
        ];
        container.innerHTML = rows.map(function (row) {
            return '<article class="comparison-card"><h3>' + escapeHtml(row[0]) + '</h3>' +
                '<div class="comparison-bar"><span style="width:' + clamp(row[1], 8, 100) + '%"></span><strong>' + row[1] + '</strong></div>' +
                '<div class="comparison-bar home"><span style="width:' + clamp(row[2], 8, 100) + '%"></span><strong>' + row[2] + '</strong></div></article>';
        }).join('');
    }

    function renderInputStatus(result) {
        var container = byId('inputSummary');
        if (!container) return;
        var usedSources = result && result.dataSourcesUsed && result.dataSourcesUsed.length ? result.dataSourcesUsed.join(', ') : 'Internal baseline team ratings';
        var rows = result ? [
            ['Winner', result.winner.name + ' ' + roundPct(result.winnerPct)],
            ['Starting pitchers', result.away.name + ': ' + (result.awayPitcher ? result.awayPitcher.name : 'Roster temporarily unavailable') + ' / ' + result.home.name + ': ' + (result.homePitcher ? result.homePitcher.name : 'Roster temporarily unavailable')],
            ['Run environment', result.runEnvironment + ' / ' + result.totalRange[0] + '-' + result.totalRange[1] + ' runs'],
            ['Simulation mode', result.simulationMode],
            ['Data mode', result.dataMode],
            ['Data sources used', usedSources],
            ['Offensive edge', result.offensiveEdge],
            ['Pitching edge', result.pitchingEdge],
            ['Run prevention edge', result.runPreventionEdge],
            ['Era adjustment', result.eraAdjustment],
            ['Confidence band', result.confidenceBand],
            ['Volatility', result.volatility],
            ['SportsDataIO', 'Not used for this estimate'],
            ['Backend live projection', backendProjectionSummary()],
            ['Sportsbook odds', result.dataSourcesUsed.indexOf('Sportsbook odds') !== -1 ? 'Verified backend board snapshot used as context' : 'Not used / not invented'],
            ['Official records', 'Excluded from picks and records']
        ] : [
            ['Dataset', 'Internal baseline team ratings'],
            ['Starting pitchers', 'Choose starters for both teams'],
            ['Data mode', dataModeLabel()],
            ['Live inputs', 'Shown only when matched to verified sources'],
            ['Backend live projection', backendProjectionSummary()],
            ['Sportsbook odds', 'Not used / not invented'],
            ['Official records', 'Excluded from picks and records']
        ];
        container.innerHTML = rows.map(function (row) {
            return '<div><strong>' + escapeHtml(row[0]) + '</strong><span>' + escapeHtml(row[1]) + '</span></div>';
        }).join('');
    }

    function renderNotes(result) {
        var list = byId('matchupNotes');
        if (!list) return;
        var liveFactorNotes = result && result.liveFactors && result.liveFactors.length ? result.liveFactors : [];
        var fallbackOnly = !result || !result.dataSourcesUsed || !result.dataSourcesUsed.length;
        var notes = result ? [
            result.dataSourcesUsed.indexOf('Sportsbook odds') !== -1 ? 'Simulation-based estimate with a verified market snapshot included as context; this is not a betting edge.' : 'Simulation-based estimate, not sportsbook odds or provider projection.',
            result.winner.name + ' grades as the simulated winner because of baseline run expectation and team-strength weighting.',
            'Starting Pitchers: ' + result.away.name + ': ' + (result.awayPitcher ? result.awayPitcher.name : 'Roster temporarily unavailable') + '; ' + result.home.name + ': ' + (result.homePitcher ? result.homePitcher.name : 'Roster temporarily unavailable') + '.',
            'Average simulated score: ' + result.away.abbreviation + ' ' + result.awayRuns + ', ' + result.home.abbreviation + ' ' + result.homeRuns + '.',
            'Projected score range: ' + result.away.abbreviation + ' ' + result.awayRange[0] + '-' + result.awayRange[1] + ', ' + result.home.abbreviation + ' ' + result.homeRange[0] + '-' + result.homeRange[1] + '.',
            'Simulation mode used: ' + result.simulationMode + '.',
            'Data mode used: ' + result.dataMode + '.',
            'Era adjustment: ' + result.eraAdjustment + '.',
            'Confidence band: ' + result.confidenceBand + ' based only on internal simulation strength.',
            'Data sources used: ' + (result.dataSourcesUsed.length ? result.dataSourcesUsed.join(', ') : 'Internal baseline team ratings only') + '.',
            'Data limitations: ' + result.dataLimitations,
            fallbackOnly ? 'Baseline simulator profiles are used when verified live feeds are unavailable.' : 'Live context is used only for verified sources; missing feeds are not guessed.'
        ].concat(liveFactorNotes) : [
            'Choose a mode, select two teams, and run the simulator. Current and historical options are loaded locally, so failed provider data will not block this tool.',
            'Simulator baselines are internal ratings. They are not SportsDataIO data, sportsbook odds, betting-edge claims, official picks, or graded records.'
        ];
        list.innerHTML = notes.map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; }).join('');
    }
    function sum(values) {
        return values.reduce(function (total, value) { return total + Number(value || 0); }, 0);
    }
    // Per-inning display cells: real extra-inning columns; a skipped home 9th
    // shows "X" (baseball convention), never a fake 0.
    function inningCells(line, totalInnings) {
        var cells = [];
        for (var i = 0; i < totalInnings; i++) {
            cells.push(i < line.innings.length ? String(line.innings[i]) : 'X');
        }
        return cells;
    }
    function boxColumnCount(box) {
        return Math.max(9, (box && box.totalInnings) || (box && box.away && box.away.innings.length) || 9);
    }
    function boxRow(line, winnerId, totalInnings) {
        var isWinner = line.team.id === winnerId;
        var teamCell = '<span class="line-score-team">' + logoMarkup(line.team, 'line-score-logo') +
            '<span class="ls-abbr">' + escapeHtml(line.team.abbreviation) + '</span></span>';
        return '<tr class="' + (isWinner ? 'winner-row' : '') + '"><th scope="row">' + teamCell + '</th>' +
            inningCells(line, totalInnings).map(function (runs) { return '<td>' + runs + '</td>'; }).join('') +
            '<td class="total-runs">' + line.runs + '</td><td>' + line.hits + '</td><td>' + line.errors + '</td></tr>';
    }
    // null means "not defined for this line" (no at-bats) and is shown as a dash,
    // never as a misleading .000.
    function fmt3(value) { return value == null ? '—' : Number(value).toFixed(3); }
    function gameEra(row) {
        var outs = Number(row.outs || 0);
        if (!outs) return '-';
        return (Number(row.er || 0) * 27 / outs).toFixed(2);
    }
    // Full MLB-depth batting line. Every counting column is folded from the same
    // event log as the line score, and the rate columns are explicitly split into
    // a GAME group and a SEASON group so the two are never confused.
    var BX_BAT_COLS = [
        { k: 'ab', h: 'AB', t: 'At-bats' }, { k: 'r', h: 'R', t: 'Runs scored' }, { k: 'h', h: 'H', t: 'Hits' },
        { k: 'b2', h: '2B', t: 'Doubles' }, { k: 'b3', h: '3B', t: 'Triples' }, { k: 'hr', h: 'HR', t: 'Home runs' },
        { k: 'rbi', h: 'RBI', t: 'Runs batted in' }, { k: 'bb', h: 'BB', t: 'Walks' }, { k: 'so', h: 'SO', t: 'Strikeouts' },
        { k: 'hbp', h: 'HBP', t: 'Hit by pitch', adv: true }, { k: 'sb', h: 'SB', t: 'Stolen bases', adv: true },
        { k: 'cs', h: 'CS', t: 'Caught stealing', adv: true }, { k: 'gidp', h: 'GIDP', t: 'Grounded into double play', adv: true },
        { k: 'sf', h: 'SF', t: 'Sacrifice flies', adv: true }, { k: 'sh', h: 'SH', t: 'Sacrifice bunts', adv: true },
        { k: 'lob', h: 'LOB', t: 'Runners left on base' }
    ];
    function batterTableRows(rows, showAdvanced) {
        // Stage 3: rows may contain substitutes (row.sub true) sharing a batting-order
        // slot with a starter. Show the order number only on the first occupant of each
        // slot and indent the substitutes, as on a professional box score. Positions
        // are assigned from the STARTERS (the first occupant of each slot).
        var starters = rows.filter(function (r) { return !r.sub; });
        var positions = assignLineupPositions(starters);
        var posBySlot = {};
        starters.forEach(function (r, i) { posBySlot[r.slot != null ? r.slot : i] = positions[i]; });
        var cols = BX_BAT_COLS.filter(function (c) { return showAdvanced || !c.adv; });
        var totals = { tb: 0 }, obDen = 0, obNum = 0;
        cols.forEach(function (c) { totals[c.k] = 0; });
        var body = rows.map(function (row, index) {
            cols.forEach(function (c) { totals[c.k] += Number(row[c.k] || 0); });
            totals.tb += Number(row.tb || 0);
            obDen += Number(row.ab || 0) + Number(row.bb || 0) + Number(row.hbp || 0) + Number(row.sf || 0);
            obNum += Number(row.h || 0) + Number(row.bb || 0) + Number(row.hbp || 0);
            var plain = (row.playerName || String(row.name || '').replace(/\s*\([^)]*\)\s*$/, ''));
            var slotNum = row.slot != null ? row.slot : index;
            var posLabel = row.sub ? (row.subRole || 'PH') : (posBySlot[slotNum] || row.rawPos || '');
            var name = (row.sub ? '<span class="bx-sub-arrow">↳</span> ' : '') + escapeHtml(plain) + ' <span class="bx-pos">' + escapeHtml(posLabel) + '</span>';
            var slotCell = row.sub ? '<span class="bx-slot bx-slot-sub"></span>' : '<span class="bx-slot">' + (slotNum + 1) + '</span>';
            var cells = cols.map(function (c) { return '<td>' + Number(row[c.k] || 0) + '</td>'; }).join('');
            return '<tr' + (row.sub ? ' class="bx-sub-row"' : '') + '><th scope="row">' + slotCell + ' ' + name + '</th>' + cells +
                '<td class="bx-rate">' + fmt3(row.gameAvg) + '</td>' +
                '<td class="bx-rate">' + fmt3(row.gameObp) + '</td>' +
                '<td class="bx-rate">' + fmt3(row.gameSlg) + '</td>' +
                '<td class="bx-rate">' + fmt3(row.gameOps) + '</td>' +
                '<td class="bx-season">' + (row.seasonAvg == null ? '—' : fmt3(row.seasonAvg)) + '</td>' +
                '<td class="bx-season">' + (row.seasonOps == null ? '—' : fmt3(row.seasonOps)) + '</td></tr>';
        }).join('');
        var tAvg = totals.ab > 0 ? totals.h / totals.ab : null;
        var tObp = obDen > 0 ? obNum / obDen : null;
        var tSlg = totals.ab > 0 ? totals.tb / totals.ab : null;
        body += '<tr class="totals-row"><th scope="row">Totals</th>' +
            cols.map(function (c) { return '<td>' + totals[c.k] + '</td>'; }).join('') +
            '<td class="bx-rate">' + fmt3(tAvg) + '</td><td class="bx-rate">' + fmt3(tObp) + '</td>' +
            '<td class="bx-rate">' + fmt3(tSlg) + '</td><td class="bx-rate">' + fmt3(tObp == null || tSlg == null ? null : tObp + tSlg) + '</td>' +
            '<td class="bx-season"></td><td class="bx-season"></td></tr>';
        return body;
    }
    function batterTableHead(showAdvanced) {
        var cols = BX_BAT_COLS.filter(function (c) { return showAdvanced || !c.adv; });
        return '<tr><th>Batter</th>' +
            cols.map(function (c) { return '<th title="' + escapeAttr(c.t) + '">' + c.h + '</th>'; }).join('') +
            '<th class="bx-rate" title="Batting average, THIS GAME">AVG</th>' +
            '<th class="bx-rate" title="On-base percentage, THIS GAME">OBP</th>' +
            '<th class="bx-rate" title="Slugging, THIS GAME">SLG</th>' +
            '<th class="bx-rate" title="OPS, THIS GAME">OPS</th>' +
            '<th class="bx-season" title="Real season-to-date batting average">SEA AVG</th>' +
            '<th class="bx-season" title="Real season-to-date OPS">SEA OPS</th></tr>';
    }
    // MLB_BOXSCORE_PCST_20260623: MLB Gameday pitch count-strikes (PC-ST) per pitcher.
    // Uses event-sourced pitches/strikes when available; otherwise the same estimate
    // as the pitch-count note line. Returns {pc, st}.
    function pitcherPcSt(row) {
        if (Number(row.pitches || 0) > 0) return { pc: Number(row.pitches), st: Math.min(Number(row.strikes || 0), Number(row.pitches)) };
        var outs = Number(row.outs || 0);
        var pc = clamp(Math.round(outs * 4.1 + Number(row.h || 0) * 4.6 + Number(row.bb || 0) * 5.2 + Number(row.so || 0) * 1.8), 8, 130);
        var st = clamp(Math.round(pc * clamp(0.61 + Number(row.so || 0) * 0.008 - Number(row.bb || 0) * 0.018, 0.52, 0.71)), 4, pc);
        return { pc: pc, st: st };
    }
    function gameWhip(row) {
        var outs = Number(row.outs || 0);
        if (!outs) return '—';
        return (((Number(row.h || 0) + Number(row.bb || 0)) * 3) / outs).toFixed(2);
    }
    function pitcherTableRows(rows, isWinner, margin, ctx, foldStaff) {
        var decisions = pitcherDecisions(rows, isWinner, margin, ctx);
        var byName = {};
        (foldStaff || []).forEach(function (p) { byName[p.name] = p; });
        var totals = { h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, hbp: 0, bf: 0, outs: 0, pc: 0, st: 0, gb: 0, fb: 0, ir: 0, irs: 0 };
        var body = rows.map(function (row, index) {
            totals.h += row.h; totals.r += row.r; totals.er += row.er; totals.bb += row.bb; totals.so += row.so;
            totals.hr += row.hr; totals.hbp += Number(row.hbp || 0); totals.bf += Number(row.bf || 0); totals.outs += Number(row.outs || 0);
            totals.ir += Number(row.ir || 0); totals.irs += Number(row.irs || 0);
            var ps = pitcherPcSt(row); totals.pc += ps.pc; totals.st += ps.st;
            // Groundouts/flyouts come from the batted-ball record in the event log.
            var f = byName[row.name] || byName[String(row.name).replace(/\s*\((LHP|RHP)\)$/, '')] || null;
            var gb = f ? f.gb : null, fb = f ? f.fb : null;
            if (f) { totals.gb += f.gb || 0; totals.fb += f.fb || 0; }
            var decClass = decisions[index] ? ' bx-dec-' + String(decisions[index]).replace(/[^A-Za-z]/g, '').toUpperCase() : '';
            var name = escapeHtml(row.name) + (decisions[index] ? ' <span class="bx-dec' + decClass + '">' + escapeHtml(decisions[index]) + '</span>' : '');
            var stPct = ps.pc ? Math.round((ps.st / ps.pc) * 100) + '%' : '—';
            return '<tr><th scope="row">' + name + '</th><td>' + escapeHtml(row.ip) + '</td><td>' + row.h + '</td><td>' + row.r + '</td><td>' + row.er + '</td><td>' + row.bb + '</td><td>' + row.so + '</td><td>' + row.hr + '</td>' +
                '<td>' + Number(row.hbp || 0) + '</td><td>' + Number(row.bf || 0) + '</td>' +
                '<td>' + ps.pc + '-' + ps.st + '</td><td>' + stPct + '</td>' +
                '<td>' + (gb === null ? '—' : gb + '-' + fb) + '</td>' +
                '<td>' + Number(row.fps || 0) + '</td><td>' + Number(row.whiff || 0) + '</td>' +
                '<td>' + Number(row.ir || 0) + '-' + Number(row.irs || 0) + '</td>' +
                '<td>' + gameEra(row) + '</td><td>' + gameWhip(row) + '</td></tr>';
        }).join('');
        var tStPct = totals.pc ? Math.round((totals.st / totals.pc) * 100) + '%' : '—';
        body += '<tr class="totals-row"><th scope="row">Totals</th><td>' + outsToIp(totals.outs) + '</td><td>' + totals.h + '</td><td>' + totals.r + '</td><td>' + totals.er + '</td><td>' + totals.bb + '</td><td>' + totals.so + '</td><td>' + totals.hr + '</td>' +
            '<td>' + totals.hbp + '</td><td>' + totals.bf + '</td><td>' + totals.pc + '-' + totals.st + '</td><td>' + tStPct + '</td>' +
            '<td>' + (totals.gb + totals.fb ? totals.gb + '-' + totals.fb : '—') + '</td><td></td><td></td>' +
            '<td>' + totals.ir + '-' + totals.irs + '</td><td></td><td></td></tr>';
        return body;
    }
    function battingFieldingDetails(result) {
        function detail(label, line) {
            var s = line.summaryStats || {};
            return '<p><strong>' + escapeHtml(label) + '</strong> 2B: ' + (s.doubles || 0) + '; 3B: ' + (s.triples || 0) + '; HR: ' + (s.homeRuns || 0) + '; TB: ' + (s.totalBases || 0) + '; RBI: ' + (s.rbi || 0) + '; 2-out RBI: ' + (s.twoOutRbi || 0) + '; BB: ' + (s.walks || 0) + '; SO: ' + (s.strikeouts || 0) + '; HBP: ' + (s.hbp || 0) + '; Runners left in scoring position, 2 out: ' + (s.lispLeft2Out || 0) + '; GIDP: ' + (s.gidp || 0) + '; SF: ' + (s.sacFlies || 0) + '; SAC (bunt): ' + (s.sacBunts || 0) + '; IBB: ' + (s.ibb || 0) + '; Team RISP: ' + (s.rispText || '0-for-0') + '; Team LOB: ' + (s.leftOnBase || 0) + '; SB: ' + (s.stolenBases || 0) + '; CS: ' + (s.caughtStealing || 0) + '; Pickoffs: ' + (s.pickoffs || 0) + '; E: ' + (s.errors || 0) + '; Outfield assists: ' + (s.outfieldAssists || 0) + '; DP: ' + (s.dp || 0) + '</p>';
        }
        return '<section class="batting-fielding-details"><h5>Batting, Baserunning &amp; Fielding</h5>' +
            detail(result.away.abbreviation, result.boxScore.away) +
            detail(result.home.abbreviation, result.boxScore.home) + '</section>';
    }
    // SCORING_DETAIL_20260703: render the event log as a clean, readable play-by-play
    // detail — Home Runs / Scoring, Extra-Base Hits, Baserunning, and Sacrifices — each
    // line with inning, player, team, responsible pitcher, and RBI, so users see exactly
    // what happened instead of a single run-on summary line. Built entirely from the
    // per-game scoringLog captured in the plate-appearance engine.
    function scoringDetailSections(result) {
        var box = result && result.boxScore;
        var log = box && Array.isArray(box.scoringLog) ? box.scoringLog : [];
        function ord(n) { n = Number(n) || 0; var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
        function frame(e) { return (e.half === 'bottom' ? 'Bot ' : 'Top ') + ord(e.inning); }
        function named(e) { return e.batter || e.runner; }
        var byType = { HR: [], XBH: [], RUN: [], SAC: [] };
        log.forEach(function (e) {
            if (!named(e)) return; // synthetic lineup with no player names -> nothing to show
            if (e.type === 'HR') byType.HR.push(e);
            else if (e.type === '2B' || e.type === '3B') byType.XBH.push(e);
            else if (e.type === 'SB' || e.type === 'CS') byType.RUN.push(e);
            else if (e.type === 'SF' || e.type === 'SAC') byType.SAC.push(e);
        });
        function line(text) { return '<li>' + escapeHtml(text) + '</li>'; }
        function block(title, items, emptyText) {
            var body = items.length ? '<ul class="scoring-detail-list">' + items.join('') + '</ul>' : '<p class="scoring-detail-empty">' + escapeHtml(emptyText) + '</p>';
            return '<div class="scoring-detail-block"><h5>' + escapeHtml(title) + '</h5>' + body + '</div>';
        }
        var hr = byType.HR.map(function (e) {
            var runs = (Number(e.rbi) || 1);
            var men = Number(e.runners) || 0;
            var outs = Number(e.outs) || 0;
            return line(frame(e) + ' — ' + e.batter + ' (' + e.team + ') homered off ' + e.pitcher + ', ' +
                runs + '-run HR, ' + men + (men === 1 ? ' runner on, ' : ' on base, ') + outs + (outs === 1 ? ' out' : ' outs'));
        });
        var xbh = byType.XBH.map(function (e) {
            var verb = e.type === '3B' ? 'tripled' : 'doubled';
            var rbi = Number(e.rbi) || 0;
            return line(frame(e) + ' — ' + e.batter + ' (' + e.team + ') ' + verb + ' off ' + e.pitcher + (rbi ? ', ' + rbi + ' RBI' : ''));
        });
        var run = byType.RUN.map(function (e) {
            var act = e.type === 'SB' ? 'stole ' + (e.base || '2nd') : 'caught stealing ' + (e.base || '2nd');
            return line(frame(e) + ' — ' + e.runner + ' (' + e.team + ') ' + act + ' (battery: ' + e.pitcher + ')');
        });
        var sac = byType.SAC.map(function (e) {
            if (e.type === 'SF') return line(frame(e) + ' — ' + e.batter + ' (' + e.team + ') sacrifice fly off ' + e.pitcher + ', 1 RBI');
            return line(frame(e) + ' — ' + e.batter + ' (' + e.team + ') sacrifice bunt (advanced a runner)');
        });
        return '<section class="scoring-detail">' +
            '<h4>Scoring Plays &amp; Detail</h4>' +
            block('Home Runs', hr, 'No home runs in this simulated game.') +
            block('Extra-Base Hits (2B / 3B)', xbh, 'No doubles or triples in this simulated game.') +
            block('Baserunning (SB / CS)', run, 'No stolen-base attempts in this simulated game.') +
            block('Sacrifices (SF / Bunt)', sac, 'No sacrifices in this simulated game.') +
            '</section>';
    }
    function pitcherNoteLine(rows) {
        return (rows || []).filter(function (row) { return row && row.name; }).map(function (row) {
            // Event-sourced pitch counts when available; legacy estimate otherwise.
            if (Number(row.pitches || 0) > 0) return row.name + ' ' + row.pitches + '-' + Math.min(row.strikes || 0, row.pitches);
            var outs = Number(row.outs || 0);
            var pitches = clamp(Math.round(outs * 4.1 + Number(row.h || 0) * 4.6 + Number(row.bb || 0) * 5.2 + Number(row.so || 0) * 1.8), 8, 130);
            var strikes = clamp(Math.round(pitches * clamp(0.61 + Number(row.so || 0) * 0.008 - Number(row.bb || 0) * 0.018, 0.52, 0.71)), 4, pitches);
            return row.name + ' ' + pitches + '-' + strikes;
        }).join('; ');
    }
    // TMR_EVENTLOG_20260723: groundouts/flyouts, batters faced and inherited
    // runners are now READ from the event log instead of being reconstructed from
    // ratio constants. The previous versions invented all three (0.52 GB share,
    // outs+H+BB for BF, 0.28/0.22 for inherited runners) even though the engine
    // already knew the real answers. `foldSide` is foldPitching() for the staff
    // that was on the mound; null only when a game predates the event log.
    function teamGroundFly(foldSide) {
        if (!foldSide) return null;
        var gb = sum(foldSide.map(function (p) { return p.gb || 0; }));
        var fb = sum(foldSide.map(function (p) { return p.fb || 0; }));
        return gb + '-' + fb;
    }
    function battersFaced(foldSide) {
        if (!foldSide) return null;
        return sum(foldSide.map(function (p) { return p.bf || 0; }));
    }
    function inheritedRunnersLine(foldSide) {
        if (!foldSide) return null;
        var ir = sum(foldSide.map(function (p) { return p.ir || 0; }));
        var irs = sum(foldSide.map(function (p) { return p.irs || 0; }));
        if (!ir) return null;
        return ir + '-' + irs;
    }
    function foldedSideFor(result, key) {
        var f = result && result.boxScore && result.boxScore.folded;
        return f && f.pitching ? f.pitching[key] : null;
    }
    function pitchingGameNotes(result) {
        var box = result && result.boxScore;
        if (!box || !box.players) return '';
        var awayPlayers = box.players.away || {};
        var homePlayers = box.players.home || {};
        var rows = [];
        var awayPitches = pitcherNoteLine(awayPlayers.pitchers);
        var homePitches = pitcherNoteLine(homePlayers.pitchers);
        if (awayPitches || homePitches) rows.push(['Pitches-strikes', [awayPitches, homePitches].filter(Boolean).join('; ')]);
        // A team's groundout/flyout line describes its BATTERS, so it is folded
        // from the opposing staff's batted-ball record.
        var foldAwayStaff = foldedSideFor(result, 'away');
        var foldHomeStaff = foldedSideFor(result, 'home');
        var gfAway = teamGroundFly(foldHomeStaff), gfHome = teamGroundFly(foldAwayStaff);
        if (gfAway || gfHome) rows.push(['Groundouts-flyouts', result.away.abbreviation + ' ' + (gfAway || 'n/a') + '; ' + result.home.abbreviation + ' ' + (gfHome || 'n/a')]);
        var bfAway = battersFaced(foldAwayStaff), bfHome = battersFaced(foldHomeStaff);
        if (bfAway !== null || bfHome !== null) rows.push(['Batters faced', result.away.abbreviation + ' ' + (bfAway === null ? 'n/a' : bfAway) + '; ' + result.home.abbreviation + ' ' + (bfHome === null ? 'n/a' : bfHome)]);
        var awayInherited = inheritedRunnersLine(foldAwayStaff);
        var homeInherited = inheritedRunnersLine(foldHomeStaff);
        if (awayInherited || homeInherited) rows.push(['Inherited runners-scored', result.away.abbreviation + ' ' + (awayInherited || '0-0') + '; ' + result.home.abbreviation + ' ' + (homeInherited || '0-0')]);
        // STATCAST_20260623: real Baseball Savant expected stats for the starters
        // (season, not game). Shown as context; not yet fed into the projection model.
        function scStarter(p) {
            var sc = p && p.mlbId ? cachedStatcast(p.mlbId, 'pitcher') : null;
            if (!sc) return null;
            var parts = [];
            if (Number.isFinite(sc.xera)) parts.push('xERA ' + sc.xera.toFixed(2));
            if (Number.isFinite(sc.xwoba)) parts.push('xwOBA-against ' + sc.xwoba.toFixed(3));
            return parts.length ? (p.name + ' ' + parts.join(', ')) : null;
        }
        var scLines = [scStarter(result.awayPitcher), scStarter(result.homePitcher)].filter(Boolean);
        if (scLines.length) rows.push(['Statcast starters (' + seasonYear() + ' season)', scLines.join('; ')]);
        return '<section class="pitching-game-notes"><h4>Pitching &amp; Game Notes</h4>' + rows.map(function (row) {
            return '<p><strong>' + escapeHtml(row[0]) + ':</strong> ' + escapeHtml(row[1]) + '</p>';
        }).join('') + '</section>';
    }
    function lineupStatusChip(players) {
        var info = players && players.lineupStatus;
        // Standardized top-level labels (June 4, 2026): CONFIRMED only when the
        // source actually confirms (today's game live/final); everything else is
        // PROJECTED with its detail; missing data is LINEUP UNAVAILABLE, never faked.
        if (!info || !info.badge) {
            return '<span class="lineup-status-chip" data-lineup-status="fallback">LINEUP UNAVAILABLE</span>';
        }
        var tone = info.status === 'confirmed' ? 'confirmed' : (info.status === 'posted' ? 'posted' : (info.status === 'historical' ? 'historical' : 'fallback'));
        var prefix = info.status === 'confirmed' ? 'CONFIRMED LINEUP' : 'PROJECTED LINEUP';
        return '<span class="lineup-status-chip" data-lineup-status="' + escapeAttr(tone) + '">' + prefix + ' - ' + escapeHtml(info.badge) + '</span>';
    }
    function battingTableSection(team, players) {
        var source = players && players.rosterSource ? players.rosterSource : 'Roster temporarily unavailable';
        var hasBatters = players && players.batters && players.batters.length;
        var headerLabel = '<div class="team-box-header"><p class="team-box-label">' + escapeHtml(team.name) + ' (' + escapeHtml(team.abbreviation) + ') Batting</p>' + lineupStatusChip(players) + '</div>';
        if (!hasBatters) {
            return '<section class="player-team-box">' + headerLabel + '<p class="player-source-note">Roster source: ' + escapeHtml(source) + '.</p><div class="sim-empty">Lineup unavailable. Verified roster data could not be loaded.</div></section>';
        }
        var freshness = lineupFreshnessNote(players && players.lineupStatus);
        var freshnessHtml = freshness ? '<p class="player-source-note lineup-freshness-note">' + escapeHtml(freshness) + '</p>' : '';
        return '<section class="player-team-box">' + headerLabel + '<p class="player-source-note">Lineup source: ' + escapeHtml(source) + '.</p>' + freshnessHtml +
            '<p class="bx-mode-legend">Rate columns: <strong>AVG/OBP/SLG/OPS</strong> are <strong>this simulated game only</strong>. <strong>SEA AVG/SEA OPS</strong> are the player\'s real season-to-date figures. The two are never blended.</p>' +
            '<div class="player-table-wrap"><table class="player-box-table bx-bat-table"><thead>' + batterTableHead(true) + '</thead><tbody>' + batterTableRows(players.batters, true) + '</tbody></table></div></section>';
    }
    function pitchingTableSection(team, players, isWinner, margin, ctx, foldStaff) {
        var hasPitchers = players && players.pitchers && players.pitchers.length;
        if (!hasPitchers) {
            return '<section class="player-team-box"><p class="team-box-label">' + escapeHtml(team.name) + ' Pitching</p><div class="sim-empty">Pitching lines unavailable.</div></section>';
        }
        var head = '<tr><th>Pitcher</th>' +
            '<th title="Innings pitched">IP</th><th title="Hits allowed">H</th><th title="Runs allowed">R</th>' +
            '<th title="Earned runs">ER</th><th title="Walks">BB</th><th title="Strikeouts">SO</th><th title="Home runs allowed">HR</th>' +
            '<th title="Hit batters">HBP</th><th title="Batters faced">BF</th>' +
            '<th title="Pitch count - strikes">PC-ST</th><th title="Strike percentage">ST%</th>' +
            '<th title="Groundouts-flyouts induced">GO-FO</th><th title="First-pitch strikes">FPS</th>' +
            '<th title="Swings and misses">SwStr</th><th title="Inherited runners - inherited runners scored">IR-IRS</th>' +
            '<th title="ERA, this game">ERA</th><th title="WHIP, this game">WHIP</th></tr>';
        return '<section class="player-team-box"><p class="team-box-label">' + escapeHtml(team.name) + ' Pitching</p>' +
            '<div class="player-table-wrap"><table class="player-box-table bx-pit-table"><thead>' + head + '</thead><tbody>' +
            pitcherTableRows(players.pitchers, isWinner, margin, ctx, foldStaff) + '</tbody></table></div></section>';
    }
    // TMR_EVENTLOG_20260723: inning-by-inning play-by-play, rendered entirely from
    // foldPlayByPlay(). Every sentence is generated from the structured event -
    // there is no hand-written prose and no second source of truth.
    function elOrdinal(n) {
        n = Number(n) || 0;
        var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }
    function elBaseLabel(bases) {
        if (!bases) return '';
        var on = [];
        if (bases[0] !== null && bases[0] !== undefined) on.push('1st');
        if (bases[1] !== null && bases[1] !== undefined) on.push('2nd');
        if (bases[2] !== null && bases[2] !== undefined) on.push('3rd');
        if (!on.length) return 'bases empty';
        if (on.length === 3) return 'bases loaded';
        return 'runner' + (on.length > 1 ? 's' : '') + ' on ' + on.join(' and ');
    }
    // TMR_ROSTER_STATE_20260723: professional-style roster-move notes — substitutions,
    // injuries and ejections — all folded from the event log. Only rendered when the
    // displayed game actually produced one (most games have none).
    function rosterMovesSection(result) {
        var folded = result && result.boxScore && result.boxScore.folded;
        if (!folded || !folded.notes) return '';
        var away = folded.notes.away, home = folded.notes.home;
        function ord(n) { n = Number(n) || 0; var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
        function frame(half, inn) { return (half === 'bottom' ? 'Bot ' : 'Top ') + ord(inn); }
        var blocks = [];
        // Substitutions (position players)
        var subs = [].concat(away.substitutions || [], home.substitutions || []);
        if (subs.length) {
            blocks.push('<div class="rm-block"><h5>Substitutions</h5><ul>' + subs.map(function (s) {
                var role = s.role === 'PH' ? 'Pinch hitter' : s.role === 'PR' ? 'Pinch runner' : s.role === 'INJ' ? 'Injury replacement' : s.role === 'EJ' ? 'Ejection replacement' : 'Defensive substitution';
                return '<li>' + escapeHtml(role + ': ' + s.in + ' for ' + (s.out || 'starter') + ' (batting ' + ((s.slot != null ? s.slot + 1 : '?')) + ')') + '</li>';
            }).join('') + '</ul></div>');
        }
        // Injuries — always labeled SIMULATED so no reader thinks a real player is hurt.
        var injuries = [].concat(away.injuries || [], home.injuries || []);
        if (injuries.length) {
            blocks.push('<div class="rm-block rm-injury"><h5>Injuries <span class="rm-sim-tag">simulated event — not a real injury report</span></h5><ul>' + injuries.map(function (i) {
                return '<li>' + escapeHtml(frame(i.half, i.inning) + ' — ' + i.player + ' (' + i.team + '): ' + i.mechanism + ', ' + i.bodyArea + ' (' + i.severity + '). ' + i.outcome + (i.replacement ? '; ' + i.replacement + ' in' : '') + (i.missedGames ? '; est. ' + i.missedGames + '-game absence' : '')) + '</li>';
            }).join('') + '</ul></div>');
        }
        // Ejections
        var ejections = [].concat(away.ejections || [], home.ejections || []);
        if (ejections.length) {
            blocks.push('<div class="rm-block rm-ejection"><h5>Ejections</h5><ul>' + ejections.map(function (e) {
                return '<li>' + escapeHtml(frame(e.half, e.inning) + ' — ' + e.person + ' (' + e.team + ') ejected: ' + e.cause + (e.replacement ? '; ' + e.replacement + (e.personType === 'manager' ? '' : ' in') : '')) + '</li>';
            }).join('') + '</ul></div>');
        }
        if (!blocks.length) return '';
        return '<section class="roster-moves"><h4>Roster Moves</h4>' + blocks.join('') + '</section>';
    }
    function playByPlaySection(result) {
        var folded = result && result.boxScore && result.boxScore.folded;
        var halves = folded && folded.playByPlay;
        if (!halves || !halves.length) return '';
        var body = halves.map(function (h) {
            if (!h.plays.length) return '';
            var label = (h.half === 'bottom' ? 'Bottom ' : 'Top ') + elOrdinal(h.inning) + ' — ' + escapeHtml(h.battingTeamAbbr || '');
            var summary = h.runs + (h.runs === 1 ? ' run' : ' runs') + ', ' + h.hits + (h.hits === 1 ? ' hit' : ' hits') + ', ' + h.lob + ' LOB';
            var plays = h.plays.map(function (p) {
                var cls = p.type === 'SUB' ? 'pbp-sub' : p.type === 'INJURY' ? 'pbp-injury' : p.type === 'EJECTION' ? 'pbp-ejection' : (p.runs > 0 ? 'pbp-scoring' : '');
                var meta = [];
                if (p.type === 'PA') {
                    meta.push(p.outsBefore + (p.outsBefore === 1 ? ' out' : ' outs'));
                    meta.push(elBaseLabel(p.basesBefore));
                    if (p.pitches && p.pitches.length) meta.push(p.pitches.length + (p.pitches.length === 1 ? ' pitch' : ' pitches'));
                    if (p.bip && p.bip.ev) meta.push(p.bip.ev + ' mph, ' + p.bip.la + '°');
                }
                var score = p.scoreAfter ? '<span class="pbp-score">' + p.scoreAfter.away + '-' + p.scoreAfter.home + '</span>' : '';
                return '<li class="' + cls + '"><span class="pbp-text">' + escapeHtml(p.detail) + '</span>' +
                    (meta.length ? '<span class="pbp-meta">' + escapeHtml(meta.join(' · ')) + '</span>' : '') + score + '</li>';
            }).join('');
            return '<details class="pbp-half"><summary><span class="pbp-half-label">' + label + '</span>' +
                '<span class="pbp-half-summary">' + escapeHtml(summary) + '</span></summary><ol class="pbp-list">' + plays + '</ol></details>';
        }).join('');
        return '<section class="pbp-section"><h4>Play-by-Play</h4>' +
            '<p class="player-source-note">Every line below is generated from the simulated event log — the same log that produced the line score and both stat tables.</p>' +
            body + '</section>';
    }
    // Development diagnostic: shows the reconciliation result between the folded
    // event log and the engine accumulators. Hidden unless ?simdiag=1 is present,
    // so production output is unchanged, but a mismatch is never silent.
    function reconciliationPanel(result) {
        var showDiag = typeof location !== 'undefined' && /(?:^|[?&])simdiag=1(?:&|$)/.test(String(location.search || ''));
        var rec = result && result.boxScore && result.boxScore.reconciliation;
        if (!rec) return '';
        if (!rec.clean && typeof console !== 'undefined' && console.error) {
            console.error('[mlb-simulator] BOX SCORE RECONCILIATION FAILED', rec.issues);
        }
        if (!showDiag) return '';
        var log = result.boxScore.eventLog;
        return '<section class="sim-diagnostic"><h4>Internal diagnostic (development mode)</h4>' +
            '<p>Event log: ' + (log ? log.events.length : 0) + ' events, ' +
            (log ? log.events.filter(function (e) { return e.eventType === 'PA'; }).length : 0) + ' plate appearances.</p>' +
            '<p>Reconciliation: <strong>' + (rec.clean ? 'CLEAN — every folded total matches the engine' : 'FAILED') + '</strong></p>' +
            (rec.clean ? '' : '<ul>' + rec.issues.map(function (i) { return '<li>' + escapeHtml(i) + '</li>'; }).join('') + '</ul>') +
            '</section>';
    }
    function renderPlayerBoxScore(result) {
        var panel = byId('playerBoxScorePanel');
        var content = byId('playerBoxScoreContent');
        if (!panel || !content) return;
        if (!result || !result.boxScore || !result.boxScore.players) {
            panel.setAttribute('data-player-box-state', 'empty');
            content.innerHTML = '<div class="sim-empty">Run a simulation to generate batter and pitcher simulation lines.</div>';
            return;
        }
        var box = result.boxScore;
        var awayWon = box.winner && box.winner.id === result.away.id;
        // WALKOFF_FROM_ENGINE_20260723: the walk-off flag now comes from the engine,
        // which knows whether the game actually ENDED on the home team taking the
        // lead. The previous renderer-side guess fired whenever the home team scored
        // in its last played half while tied or trailing before it - true of any
        // late go-ahead rally, including one in the 8th. That mislabelled ordinary
        // wins as walk-offs and handed the W to the closer instead of the starter.
        var homeInn = (box.home && box.home.innings) || [];
        var extra = homeInn.length > 9 || ((box.away && box.away.innings || []).length > 9);
        var walkOff = !!box.walkOff;
        var margin = Math.abs(box.away.runs - box.home.runs);
        panel.setAttribute('data-player-box-state', 'projected');
        content.innerHTML = '<p class="player-source-note box-score-disclaimer">Simulation output from TrustMyRecord. Player stat lines are modeled from the selected matchup and are not official MLB stats.</p>' +
            '<h4>Batting</h4>' +
            battingTableSection(result.away, box.players.away) +
            battingTableSection(result.home, box.players.home) +
            battingFieldingDetails(result) +
            scoringDetailSections(result) +
            '<h4>Pitching</h4>' +
            pitchingTableSection(result.away, box.players.away, awayWon, margin, { walkOff: walkOff, extra: extra, isHome: false }, foldedSideFor(result, 'away')) +
            pitchingTableSection(result.home, box.players.home, !awayWon, margin, { walkOff: walkOff, extra: extra, isHome: true }, foldedSideFor(result, 'home')) +
            pitchingGameNotes(result) +
            rosterMovesSection(result) +
            playByPlaySection(result) +
            reconciliationPanel(result);
    }
    // TOP_SCOREBOARD_20260603: baseball line-score scoreboard rendered at the top of the result card.
    function renderTopScoreboard(result) {
        var wrap = byId('topScoreboard');
        if (!wrap) return;
        if (!result || !result.boxScore) {
            wrap.setAttribute('data-state', 'empty');
            wrap.innerHTML = '';
            return;
        }
        var box = result.boxScore;
        var awayWon = box.away.runs > box.home.runs;
        var totalInnings = boxColumnCount(box);
        function sbRow(line, won) {
            return '<tr class="sb-row' + (won ? ' sb-winner' : '') + '">' +
                '<th scope="row" class="sb-team">' + logoMarkup(line.team, 'sb-logo') + '<span class="sb-team-text"><strong>' + escapeHtml(line.team.abbreviation) + '</strong><span>' + escapeHtml(line.team.name) + '</span></span></th>' +
                inningCells(line, totalInnings).map(function (runs) { return '<td class="sb-inning">' + runs + '</td>'; }).join('') +
                '<td class="sb-total sb-runs">' + line.runs + '</td>' +
                '<td class="sb-total">' + line.hits + '</td>' +
                '<td class="sb-total">' + line.errors + '</td></tr>';
        }
        var winnerLine = awayWon ? box.away : box.home;
        var loserLine = awayWon ? box.home : box.away;
        var headerCols = [];
        for (var n = 1; n <= totalInnings; n++) headerCols.push('<th class="sb-inning">' + n + '</th>');
        wrap.setAttribute('data-state', 'final');
        wrap.innerHTML = '<div class="sb-topline">' +
            '<span class="sb-final-tag">Final' + (totalInnings > 9 ? '/' + totalInnings : '') + '</span>' +
            '<span class="sb-final-score">' + escapeHtml(winnerLine.team.abbreviation) + ' ' + winnerLine.runs + ', ' + escapeHtml(loserLine.team.abbreviation) + ' ' + loserLine.runs + '</span>' +
            '<span class="sb-sim-tag">Simulated</span></div>' +
            '<div class="sb-scroll"><table class="sb-table" aria-label="Simulated line score by inning">' +
            '<thead><tr><th class="sb-team-head">Team</th>' + headerCols.join('') +
            '<th class="sb-total sb-runs-head">R</th><th class="sb-total">H</th><th class="sb-total">E</th></tr></thead>' +
            '<tbody>' + sbRow(box.away, awayWon) + sbRow(box.home, !awayWon) + '</tbody></table></div>';
    }
    function renderBoxScoreMatchupCard(result) {
        var card = byId('boxScoreMatchupCard');
        if (!card) return;
        if (!result || !result.boxScore) {
            card.setAttribute('data-state', 'empty');
            card.innerHTML = '';
            return;
        }
        var box = result.boxScore;
        card.setAttribute('data-state', 'final');
        function teamCard(side, line, won) {
            return '<div class="box-score-team-card ' + side + (won ? ' winner' : '') + '">' +
                logoMarkup(line.team, 'scoreboard-logo') +
                '<div><strong>' + escapeHtml(line.team.abbreviation) + (won ? ' <span class="bx-win-dot" title="Winner">▸</span>' : '') + '</strong>' +
                '<span>' + escapeHtml(line.team.name) + '</span>' +
                '<small>' + line.hits + ' H / ' + line.errors + ' E</small></div></div>';
        }
        card.innerHTML = '<div class="box-score-matchup-main">' +
            teamCard('away', box.away, box.away.runs > box.home.runs) +
            '<div class="box-score-final"><span class="bsf-score"><strong>' + box.away.runs + '</strong><em>-</em><strong>' + box.home.runs + '</strong></span><span class="bsf-final">· FINAL</span></div>' +
            teamCard('home', box.home, box.home.runs > box.away.runs) +
            '</div>' +
            '<p class="box-score-honesty">Simulated final score, not official MLB stats.</p>';
    }
    function boxScoreText(result) {
        if (!result || !result.boxScore) return '';
        var box = result.boxScore;
        var generatedAt = new Date().toISOString();
        var lines = [];
        lines.push('TrustMyRecord MLB Simulator Box Score');
        lines.push('Generated: ' + generatedAt);
        lines.push(result.away.name + ' at ' + result.home.name);
        lines.push('Mode: ' + result.simulationMode + ' / Data: ' + result.dataMode);
        lines.push('Simulated final: ' + result.away.name + ' ' + box.away.runs + ', ' + result.home.name + ' ' + box.home.runs);
        lines.push('Win probability: ' + result.away.name + ' ' + roundPct(result.awayWin) + ' / ' + result.home.name + ' ' + roundPct(result.homeWin));
        lines.push('Expected runs: ' + result.away.name + ' ' + result.awayRuns + ' / ' + result.home.name + ' ' + result.homeRuns);
        lines.push('Starting Pitchers: ' + result.away.name + ': ' + (result.awayPitcher ? result.awayPitcher.name : 'Roster temporarily unavailable') + ' | ' + result.home.name + ': ' + (result.homePitcher ? result.homePitcher.name : 'Roster temporarily unavailable'));
        lines.push('');
        var txtInnings = boxColumnCount(box);
        var txtHeader = [];
        for (var ti = 1; ti <= txtInnings; ti++) txtHeader.push(String(ti));
        lines.push('Team        ' + txtHeader.join(' ') + ' | R H E');
        [box.away, box.home].forEach(function (line) {
            lines.push((line.team.abbreviation + '          ').slice(0, 10) + inningCells(line, txtInnings).join(' ') + ' | ' + line.runs + ' ' + line.hits + ' ' + line.errors);
        });
        lines.push('');
        lines.push('Final: ' + box.winner.name + ' ' + Math.max(box.away.runs, box.home.runs) + ', ' + box.loser.name + ' ' + Math.min(box.away.runs, box.home.runs));
        lines.push(box.summary);
        lines.push('Pitcher lines: ' + box.pitcherLines.join(' / '));
        lines.push('Key performers: ' + box.keyPerformers.join(' / '));
        if (box.players) {
            lines.push('');
            lines.push('Player Box Score');
            [
                [result.away.name, box.players.away],
                [result.home.name, box.players.home]
            ].forEach(function (group) {
                lines.push(group[0] + ' batters - ' + (group[1].rosterSource || 'Roster temporarily unavailable'));
                lines.push('Batter, AB, R, H, HR, RBI, BB, SO');
                group[1].batters.forEach(function (row) {
                    lines.push([row.name, row.ab, row.r, row.h, row.hr || 0, row.rbi, row.bb, row.so].join(', '));
                });
                lines.push(group[0] + ' pitchers');
                lines.push('Pitcher, IP, H, R, ER, BB, SO, HR');
                group[1].pitchers.forEach(function (row) {
                    lines.push([row.name, row.ip, row.h, row.r, row.er, row.bb, row.so, row.hr].join(', '));
                });
            });
        }
        lines.push('');
        lines.push('Team summary:');
        [box.away, box.home].forEach(function (line) {
            var s = line.summaryStats || {};
            lines.push(line.team.abbreviation + ': 2B ' + (s.doubles || 0) + ', 3B ' + (s.triples || 0) + ', HR ' + (s.homeRuns || 0) + ', TB ' + (s.totalBases || 0) + ', RBI ' + (s.rbi || 0) + ', BB ' + (s.walks || 0) + ', SO ' + (s.strikeouts || 0) + ', HBP ' + (s.hbp || 0) + ', SF ' + (s.sacFlies || 0) + ', SAC ' + (s.sacBunts || 0) + ', SB ' + (s.stolenBases || 0) + ', CS ' + (s.caughtStealing || 0) + ', GIDP ' + (s.gidp || 0) + ', LOB ' + (s.leftOnBase || 0) + ', RISP ' + (s.rispText || '0-for-0') + ', E ' + (s.errors || 0) + ', DP ' + (s.dp || 0) + ', Pitches ' + (s.totalPitches || 0) + '-' + (s.totalStrikes || 0));
        });
        if (Array.isArray(box.scoringLog) && box.scoringLog.length) {
            var ordT = function (n) { n = Number(n) || 0; var a = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (a[(v - 20) % 10] || a[v] || a[0]); };
            var frameT = function (e) { return (e.half === 'bottom' ? 'Bot ' : 'Top ') + ordT(e.inning); };
            var hrT = box.scoringLog.filter(function (e) { return e.type === 'HR' && (e.batter || e.runner); });
            if (hrT.length) {
                lines.push('');
                lines.push('Home Runs:');
                hrT.forEach(function (e) {
                    lines.push('  ' + frameT(e) + ': ' + e.batter + ' (' + e.team + '), ' + ((Number(e.rbi) || 1)) + '-run HR off ' + e.pitcher + ', ' + (Number(e.runners) || 0) + ' on, ' + (Number(e.outs) || 0) + ' out');
                });
            }
            var otherT = box.scoringLog.filter(function (e) { return e.type !== 'HR' && (e.batter || e.runner); });
            if (otherT.length) {
                lines.push('');
                lines.push('Other scoring/baserunning detail:');
                otherT.forEach(function (e) {
                    var who = e.batter || e.runner;
                    var desc = e.type === '2B' ? 'double off ' + e.pitcher : e.type === '3B' ? 'triple off ' + e.pitcher
                        : e.type === 'SB' ? 'stole ' + (e.base || '2nd') : e.type === 'CS' ? 'caught stealing ' + (e.base || '2nd')
                        : e.type === 'SF' ? 'sacrifice fly off ' + e.pitcher : e.type === 'SAC' ? 'sacrifice bunt'
                        : e.type === 'HBP' ? 'hit by pitch (' + e.pitcher + ')' : e.type;
                    lines.push('  ' + frameT(e) + ': ' + who + ' (' + e.team + '), ' + desc + (e.rbi ? ', ' + e.rbi + ' RBI' : ''));
                });
            }
        }
        lines.push('Matchup notes: ' + result.keyExplanation);
        lines.push('Projection notice: Simulation-based estimate, not sportsbook odds or a guaranteed result.');
        return lines.join('\n');
    }
    function boxScoreFilename(result) {
        var away = slugify(result.away.name);
        var home = slugify(result.home.name);
        var stamp = new Date().toISOString().slice(0, 10);
        return 'trustmyrecord-mlb-simulator-box-score-' + away + '-vs-' + home + '-' + stamp + '.txt';
    }
    function setExportButtons(enabled) {
        var copy = byId('copyBoxScoreButton');
        var save = byId('saveBoxScoreButton');
        var view = byId('viewBoxScoreLink');
        var viewControl = byId('viewBoxScoreControl');
        var viewLabel = state.aggregate && state.aggregate.count > 1 ? 'View Summary & Box Score' : 'View Box Score';
        if (copy) copy.disabled = !enabled;
        if (save) save.disabled = !enabled;
        if (view) {
            view.setAttribute('aria-disabled', enabled ? 'false' : 'true');
            view.textContent = viewLabel;
        }
        if (viewControl) {
            viewControl.setAttribute('aria-disabled', enabled ? 'false' : 'true');
            viewControl.textContent = viewLabel;
        }
    }
    function selectedSimulationCount() {
        var select = byId('simulationCountSelect');
        var value = select ? Number(select.value) : 1;
        return [1, 10, 25, 50, 100].indexOf(value) !== -1 ? value : 1;
    }
    function buildAggregate(results, away, home) {
        var count = results.length;
        var awayWins = results.filter(function (result) { return result.boxScore && result.boxScore.winner.id === away.id; }).length;
        var homeWins = count - awayWins;
        var awayRuns = sum(results.map(function (result) { return result.boxScore ? result.boxScore.away.runs : 0; }));
        var homeRuns = sum(results.map(function (result) { return result.boxScore ? result.boxScore.home.runs : 0; }));
        var commonWinner = awayWins >= homeWins ? away : home;
        return {
            count: count,
            away: away,
            home: home,
            awayWins: awayWins,
            homeWins: homeWins,
            awayWinPct: awayWins / count,
            homeWinPct: homeWins / count,
            awayAverageScore: round1(awayRuns / count),
            homeAverageScore: round1(homeRuns / count),
            commonWinner: commonWinner,
            summary: count + ' simulation runs produced ' + away.name + ' ' + awayWins + ' wins and ' + home.name + ' ' + homeWins + ' wins. Most common simulated winner: ' + commonWinner.name + '.'
        };
    }
    function renderAggregate(aggregate) {
        var panel = byId('aggregatePanel');
        var grid = byId('aggregateSummaryGrid');
        var summary = byId('aggregateSummaryText');
        if (!panel || !grid || !summary) return;
        if (!aggregate || aggregate.count <= 1) {
            panel.setAttribute('data-aggregate-state', 'empty');
            grid.innerHTML = '<div><strong>Runs</strong><span>Choose 10, 25, 50, or 100 simulations.</span></div>';
            summary.textContent = 'Multiple-simulation output is simulation-based, not official prediction certainty.';
            return;
        }
        panel.setAttribute('data-aggregate-state', 'projected');
        var rows = [
            ['Simulations Run', aggregate.count],
            [aggregate.away.abbreviation + ' Wins', aggregate.awayWins + ' (' + roundPct(aggregate.awayWinPct) + ')'],
            [aggregate.home.abbreviation + ' Wins', aggregate.homeWins + ' (' + roundPct(aggregate.homeWinPct) + ')'],
            ['Average Score', aggregate.away.abbreviation + ' ' + aggregate.awayAverageScore + ' / ' + aggregate.home.abbreviation + ' ' + aggregate.homeAverageScore],
            ['Most Common Winner', aggregate.commonWinner.name],
            ['Output Type', 'Simulation-based estimate']
        ];
        grid.innerHTML = rows.map(function (row) {
            return '<div><strong>' + escapeHtml(row[0]) + '</strong><span>' + escapeHtml(row[1]) + '</span></div>';
        }).join('');
        summary.textContent = aggregate.summary + ' This is simulation output, not official prediction certainty.';
    }
    function renderBoxScore(result) {
        var panel = byId('boxScorePanel');
        var title = byId('boxScoreTitle');
        var body = byId('boxScoreBody');
        var summary = byId('boxScoreSummary');
        if (!panel || !title || !body) return;
        if (!result || !result.boxScore) {
            panel.setAttribute('data-box-score-state', 'empty');
            title.textContent = 'Run a simulation to generate a box score.';
            var emptyHeadRow = byId('boxScoreHeadRow');
            if (emptyHeadRow) emptyHeadRow.innerHTML = '<th>Team</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>R</th><th>H</th><th>E</th>';
            body.innerHTML = '<tr><td colspan="13">Run a simulation to generate a box score.</td></tr>';
            if (summary) summary.textContent = 'Run a simulation to generate a box score.';
            setExportButtons(false);
            renderTopScoreboard(null);
            renderBoxScoreMatchupCard(null);
            renderPlayerBoxScore(null);
            return;
        }
        var box = result.boxScore;
        panel.setAttribute('data-box-score-state', 'projected');
        renderTopScoreboard(result);
        renderBoxScoreMatchupCard(result);
        var totalInnings = boxColumnCount(box);
        var headRow = byId('boxScoreHeadRow');
        if (headRow) {
            var headCols = ['<th>Team</th>'];
            for (var n = 1; n <= totalInnings; n++) headCols.push('<th>' + n + '</th>');
            headCols.push('<th>R</th><th>H</th><th>E</th>');
            headRow.innerHTML = headCols.join('');
        }
        title.textContent = result.away.name + ' at ' + result.home.name + ' / Final' + (totalInnings > 9 ? '/' + totalInnings : '') + ' ' + result.away.abbreviation + ' ' + box.away.runs + ', ' + result.home.abbreviation + ' ' + box.home.runs;
        body.innerHTML = boxRow(box.away, box.winner.id, totalInnings) + boxRow(box.home, box.winner.id, totalInnings);
        if (summary) summary.innerHTML = '<strong>' + escapeHtml(box.summary) + '</strong><span>' + escapeHtml(box.pitcherLines.join(' / ')) + '</span><span>' + escapeHtml(box.keyPerformers.join(' / ')) + '</span>';
        renderPlayerBoxScore(result);
        setExportButtons(true);
    }

    // MODEL_VS_MARKET_20260623: read-only comparison of the simulator's win % to the
    // no-vig market-implied win %. Research context only; explicitly NOT a betting edge.
    function renderModelVsMarket(result) {
        var el = byId('modelVsMarket');
        if (!el) return;
        if (!result || !result.marketWin) {
            el.setAttribute('data-mvm-state', 'empty');
            el.innerHTML = '';
            return;
        }
        var m = result.marketWin;
        function pct(x) { return Math.round(x * 100) + '%'; }
        function diff(model, market) { var d = (model - market) * 100; return (d >= 0 ? '+' : '') + d.toFixed(1); }
        function row(name, model, market) {
            return '<tr><th scope="row">' + escapeHtml(name) + '</th><td>' + pct(model) + '</td><td>' + pct(market) + '</td><td>' + diff(model, market) + '</td></tr>';
        }
        el.setAttribute('data-mvm-state', 'shown');
        el.innerHTML = '<div class="mvm-head">Model vs Market <span class="mvm-note">research context — not a betting edge</span></div>' +
            '<table class="mvm-table"><thead><tr><th>Team</th><th>Model</th><th>Market</th><th>Diff (pts)</th></tr></thead><tbody>' +
            row(result.away.abbreviation, result.awayWin, m.awayPct) +
            row(result.home.abbreviation, result.homeWin, m.homePct) +
            '</tbody></table>' +
            '<div class="mvm-foot">' + escapeHtml(m.book) + ' no-vig moneyline snapshot. Simulation estimate only; no wager is implied or recommended.</div>';
    }

    function isPitcherPosition(pos) {
        return /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(pos || ''));
    }
    function handLabel(mlbId) {
        var h = pitchHandOf(mlbId);
        return h === 'L' ? 'LHP' : h === 'R' ? 'RHP' : 'P';
    }
    function bullpenPitcherInfo(p, probableNorm) {
        var stat = p.mlbId ? cachedPlayerStat(p.mlbId, 'pitching') : null;
        var gs = stat ? Number(stat.gamesStarted || 0) : 0;
        var g = stat ? Number(stat.gamesPitched || stat.gamesPlayed || 0) : 0;
        var era = stat && stat.era != null && stat.era !== '-.--' ? Number(stat.era) : null;
        var sv = stat ? Number(stat.saves || 0) : 0;
        var rec = stat ? (Number(stat.wins || 0) + '-' + Number(stat.losses || 0)) : null;
        var isProbable = probableNorm && normalizeName(p.name) === probableNorm;
        // Role is INFERRED from games started (the active-roster feed has no role data).
        var role = isProbable || (stat && gs >= 3 && (g === 0 || gs / g >= 0.5)) ? 'rotation' : 'bullpen';
        return { name: p.name, hand: handLabel(p.mlbId), gs: gs, g: g, era: era, sv: sv, rec: rec, role: role, hasStat: !!stat, isProbable: isProbable };
    }
    function bullpenEraClass(era) {
        if (!Number.isFinite(era)) return 'era-na';
        if (era < 3) return 'era-good';
        if (era < 4.5) return 'era-mid';
        return 'era-high';
    }
    function bullpenRowHtml(i) {
        var era = Number.isFinite(i.era) ? i.era.toFixed(2) : '-';
        var games = i.g > 0 ? (i.gs > 0 ? i.g + '/' + i.gs : String(i.g)) : '-';
        return '<li class="bp-row">'
            + '<span class="bp-name" title="' + escapeAttr(i.name) + '">' + escapeHtml(i.name) + (i.hasStat ? '' : '<span class="bp-nostat">No 2026 stats loaded</span>') + '</span>'
            + '<span class="bp-hand">' + escapeHtml(i.hand) + '</span>'
            + '<span class="bp-num ' + bullpenEraClass(i.era) + '">' + era + '</span>'
            + '<span class="bp-num">' + (i.rec ? escapeHtml(i.rec) : '-') + '</span>'
            + '<span class="bp-num">' + (i.sv > 0 ? i.sv : '-') + '</span>'
            + '<span class="bp-num">' + games + '</span>'
            + '</li>';
    }
    function bullpenColsHtml() {
        return '<li class="bp-row bp-cols" aria-hidden="true"><span>Player</span><span>Thr</span><span>ERA</span><span>W-L</span><span>SV</span><span>G/GS</span></li>';
    }
    function bullpenSubhead(label, count, tip) {
        return '<div class="bullpen-subhead">' + label
            + (count != null ? ' <span class="bp-count">' + escapeHtml(String(count)) + '</span>' : '')
            + ' <span class="bp-info" title="' + escapeAttr(tip) + '">i</span></div>';
    }
    function renderBullpenForTeam(team) {
        var colors = teamColors(team);
        var head = '<div class="bullpen-team" style="--bp-accent:' + escapeAttr(colors[0]) + ';">'
            + '<div class="bullpen-team-head">' + logoMarkup(team, 'bullpen-logo')
            + '<h3>' + escapeHtml(team ? team.name : 'Team') + '</h3></div>'
            + '<div class="bullpen-team-body">';
        var close = '</div></div>';
        if (!team || team.era !== 'current') {
            return head + '<div class="sim-empty">Active bullpen is shown for current MLB teams only. Classic/historical teams use rating profiles, not live rosters.</div>' + close;
        }
        var stored = state.liveContext.teamRosters && state.liveContext.teamRosters[team.abbreviation];
        var roster = validatedRosterForTeam(team, stored);
        if (!roster || !Array.isArray(roster.players)) {
            return head + '<div class="sim-empty">Active bullpen unavailable: the live MLB active-roster feed did not load for ' + escapeHtml(team.abbreviation) + '. No names are shown rather than display stale data.</div>' + close;
        }
        var seen = {}, pitchers = [];
        roster.players.filter(function (p) { return isPitcherPosition(p.position); }).forEach(function (p) {
            var k = normalizeName(p.name);
            if (!k || seen[k]) return; // no duplicates
            seen[k] = true; pitchers.push(p);
        });
        var probable = stored && stored.todayProbableStarter;
        var probableNorm = probable && probable.name ? normalizeName(probable.name) : null;
        var infos = pitchers.map(function (p) { return bullpenPitcherInfo(p, probableNorm); });
        var rotation = infos.filter(function (i) { return i.role === 'rotation'; }).sort(function (a, b) {
            if (a.isProbable !== b.isProbable) return a.isProbable ? -1 : 1;
            return (b.gs || 0) - (a.gs || 0);
        });
        var pen = infos.filter(function (i) { return i.role === 'bullpen'; }).sort(function (a, b) {
            var ae = Number.isFinite(a.era) ? a.era : 99, be = Number.isFinite(b.era) ? b.era : 99;
            return ae - be;
        });
        var html = head;
        // Probable / projected starter (featured)
        if (probable && probable.name) {
            var probInfo = infos.filter(function (i) { return i.isProbable; })[0];
            var chips = '';
            if (probInfo && probInfo.hasStat) {
                chips = '<div class="bp-starter-stats">'
                    + '<div class="bp-stat"><b class="' + bullpenEraClass(probInfo.era) + '">' + (Number.isFinite(probInfo.era) ? probInfo.era.toFixed(2) : '-') + '</b><span>ERA</span></div>'
                    + '<div class="bp-stat"><b>' + escapeHtml(probInfo.rec || '-') + '</b><span>Record</span></div>'
                    + '<div class="bp-stat"><b>' + probInfo.gs + '</b><span>Starts</span></div>'
                    + '<div class="bp-stat"><b>' + probInfo.g + '</b><span>Games</span></div>'
                    + (probInfo.sv > 0 ? '<div class="bp-stat"><b>' + probInfo.sv + '</b><span>Saves</span></div>' : '')
                    + '</div>';
            } else if (probInfo) {
                chips = '<div class="bullpen-meta" style="margin-top:8px;">No 2026 stats loaded</div>';
            }
            html += '<div class="bullpen-starter">'
                + '<div class="bp-starter-top"><span class="bullpen-tag bullpen-tag-confirmed" title="Today&#39;s probable starter from the official MLB schedule">Probable Starter</span>'
                + (probInfo ? '<span class="bullpen-hand">' + escapeHtml(probInfo.hand) + '</span>' : '')
                + '</div>'
                + '<div class="bp-starter-name">' + escapeHtml(probable.name) + '</div>'
                + chips + '</div>';
        } else {
            html += '<div class="bullpen-starter">'
                + '<div class="bp-starter-top"><span class="bullpen-tag bullpen-tag-projected">Starter Not Posted</span></div>'
                + '<div class="bullpen-meta" style="margin-top:8px;">Today&#39;s starter is not yet listed on the MLB schedule.</div></div>';
        }
        // Other rotation arms (roles inferred; disclosed in subhead tooltip + section header)
        var otherRotation = rotation.filter(function (i) { return !i.isProbable; });
        if (otherRotation.length) {
            html += bullpenSubhead('Rotation Depth', otherRotation.length, 'Rotation roles are inferred from games started this season, not official role data. The active-roster feed publishes no roles.');
            html += '<ul class="bullpen-list">' + bullpenColsHtml();
            otherRotation.forEach(function (i) { html += bullpenRowHtml(i); });
            html += '</ul>';
        }
        // Active bullpen
        html += bullpenSubhead('Available Bullpen', pen.length + ' arm' + (pen.length === 1 ? '' : 's'), 'Relief roles are inferred; the roster feed has no closer or setup data.');
        if (!pen.length) {
            html += '<div class="sim-empty">No relief arms classified from the current roster + loaded stats.</div>';
        } else {
            html += '<ul class="bullpen-list">' + bullpenColsHtml();
            pen.forEach(function (i) { html += bullpenRowHtml(i); });
            html += '</ul>';
        }
        html += '<div class="bullpen-foot">'
            + '<span class="bp-chip"><span class="bp-dot"></span>Live roster data</span>'
            + '<span class="bp-chip" title="Verified active roster players">' + roster.players.length + ' Active Players</span>'
            + '<span class="bp-chip">' + pitchers.length + ' Pitchers</span>'
            + (stored && stored.fetchedAt ? '<span class="bp-chip">Updated ' + escapeHtml(new Date(stored.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) + '</span>' : '')
            + '</div>';
        return html + close;
    }
    function renderBullpenPanels(result) {
        var panel = byId('bullpenPanel');
        var content = byId('bullpenContent');
        if (!panel || !content) return;
        if (!result || !result.away || !result.home) {
            panel.setAttribute('data-bullpen-state', 'empty');
            content.innerHTML = '<div class="sim-empty">Run a simulation to load each team’s active bullpen.</div>';
            return;
        }
        panel.setAttribute('data-bullpen-state', 'ready');
        content.innerHTML = '<div class="bullpen-grid">'
            + renderBullpenForTeam(result.away) + renderBullpenForTeam(result.home) + '</div>';
    }
    function renderResult(result) {
        if (!result) {
            var shell = byId('projectionShell');
            if (shell) shell.setAttribute('data-projection-state', 'not-connected');
            var emptyState = byId('projectionEmptyState');
            if (emptyState) emptyState.setAttribute('data-empty-state', 'ready');
            var probabilityLab = byId('probabilityLab');
            if (probabilityLab) probabilityLab.setAttribute('data-probability-state', 'empty');
            setText('projectedScoreValue', 'Run simulation');
            setText('winProbabilityValue', 'Select teams');
            setText('expectedRunsValue', 'Choose starters');
            setText('totalRangeValue', 'Run to calculate');
            setText('runEnvironmentValue', 'Run to calculate');
            setText('simulationConfidenceValue', 'Run to calculate');
            setText('eraAdjustmentValue', 'Run to calculate');
            setText('simulationModeValue', 'Ready to run');
            setText('dataModeValue', dataModeLabel());
            renderDataModeChip(null);
            renderModelVsMarket(null);
            setText('awayProbabilityLabel', 'Team A');
            setText('homeProbabilityLabel', 'Team B');
            setText('awayProbabilityValue', '--');
            setText('homeProbabilityValue', '--');
            setText('winnerBadge', 'Run a simulation');
            setText('awayScoreLabel', 'Team A');
            setText('homeScoreLabel', 'Team B');
            setText('awayScoreBig', '--');
            setText('homeScoreBig', '--');
            setText('awayExpectedTile', 'Starter selected above');
            setText('homeExpectedTile', 'Starter selected above');
            setText('keyExplanationValue', 'Select two teams, choose starting pitchers, then run the simulator to generate projected score, win probability, expected runs, confidence band, and full box score.');
            var emptyCard = byId('resultCard');
            if (emptyCard) emptyCard.setAttribute('data-result-state', 'empty');
            setText('projectionNotice', 'Simulation-based estimate mode is ready. Select two teams and click Run Simulation.');
            renderComparison(null);
            renderInputStatus(null);
            renderNotes(null);
            renderAggregate(null);
            renderBoxScore(null);
            renderBullpenPanels(null);
            return;
        }
        var shellProjected = byId('projectionShell');
        if (shellProjected) shellProjected.setAttribute('data-projection-state', 'projected');
        var emptyProjected = byId('projectionEmptyState');
        if (emptyProjected) emptyProjected.setAttribute('data-empty-state', 'hidden');
        var probabilityProjected = byId('probabilityLab');
        if (probabilityProjected) probabilityProjected.setAttribute('data-probability-state', 'projected');
        var resultCard = byId('resultCard');
        if (resultCard) resultCard.setAttribute('data-result-state', 'projected');
        setText('winnerBadge', result.winner.name + ' ' + roundPct(result.winnerPct));
        setText('awayScoreLabel', result.away.name);
        setText('homeScoreLabel', result.home.name);
        setText('awayScoreBig', result.projectedAwayScore);
        setText('homeScoreBig', result.projectedHomeScore);
        setText('awayExpectedTile', 'Expected runs ' + result.awayRuns);
        setText('homeExpectedTile', 'Expected runs ' + result.homeRuns);
        setText('keyExplanationValue', result.keyExplanation);
        setText('projectedScoreValue', result.away.abbreviation + ' ' + result.awayRange[0] + '-' + result.awayRange[1] + ' / ' + result.home.abbreviation + ' ' + result.homeRange[0] + '-' + result.homeRange[1]);
        setText('winProbabilityValue', result.winner.abbreviation + ' ' + roundPct(result.winnerPct));
        setText('expectedRunsValue', result.away.abbreviation + ' ' + result.awayRuns + ' / ' + result.home.abbreviation + ' ' + result.homeRuns);
        setText('totalRangeValue', result.totalRange[0] + '-' + result.totalRange[1]);
        setText('runEnvironmentValue', result.runEnvironment);
        setText('simulationConfidenceValue', result.confidenceBand);
        setText('eraAdjustmentValue', result.eraAdjustment);
        setText('simulationModeValue', result.simulationMode);
        setText('dataModeValue', result.dataMode);
        renderDataModeChip(result);
        renderModelVsMarket(result);
        setText('awayProbabilityLabel', result.away.name);
        setText('homeProbabilityLabel', result.home.name);
        setText('awayProbabilityValue', roundPct(result.awayWin));
        setText('homeProbabilityValue', roundPct(result.homeWin));
        var awayBar = byId('awayProbabilityBar');
        var homeBar = byId('homeProbabilityBar');
        if (awayBar) awayBar.style.width = clamp(result.awayWin * 100, 2, 98) + '%';
        if (homeBar) homeBar.style.width = clamp(result.homeWin * 100, 2, 98) + '%';
        setText('projectionNotice', state.aggregate && state.aggregate.count > 1 ? 'Aggregate summary is based on ' + state.aggregate.count + ' simulation runs. Latest Simulated Box Score is shown below for copy/save.' : (result.dataSourcesUsed.length ? 'Verified live inputs are included where listed. No SportsDataIO data, betting edge, or official record is created.' : 'Simulation-based estimate, not sportsbook odds or provider projection. No SportsDataIO data, betting edge, or official record is created.'));
        renderComparison(result);
        renderInputStatus(result);
        renderNotes(result);
        renderAggregate(state.aggregate);
        renderBoxScore(result);
        renderBullpenPanels(result);
    }

    function renderLoading(away, home) {
        var shell = byId('projectionShell');
        var resultCard = byId('resultCard');
        if (shell) shell.setAttribute('data-projection-state', 'loading');
        var emptyState = byId('projectionEmptyState');
        if (emptyState) emptyState.setAttribute('data-empty-state', 'hidden');
        var probabilityLab = byId('probabilityLab');
        if (probabilityLab) probabilityLab.setAttribute('data-probability-state', 'empty');
        if (resultCard) resultCard.setAttribute('data-result-state', 'loading');
        setText('winnerBadge', 'Running baseline sim...');
        setText('awayScoreLabel', away ? away.name : 'Team A');
        setText('homeScoreLabel', home ? home.name : 'Team B');
        setText('keyExplanationValue', 'Calculating internal baseline ratings, run environment, era context, and matchup strength.');
        setText('projectionNotice', 'Running simulation from internal baseline team ratings. No live odds, injuries, weather, or starters are being loaded.');
        renderDataModeStatus();
    }

    function switchMode(mode) {
        state.preset = mode === 'historical' || mode === 'mixed' ? mode : 'current';
        if (state.preset === 'historical') {
            state.awayPool = 'historical';
            state.homePool = 'historical';
        } else if (state.preset === 'mixed') {
            state.awayPool = 'current';
            state.homePool = 'historical';
        } else {
            state.awayPool = 'current';
            state.homePool = 'current';
        }
        state.awayTeamId = poolTeams(state.awayPool)[0].id;
        state.homeTeamId = poolTeams(state.homePool)[1] ? poolTeams(state.homePool)[1].id : poolTeams(state.homePool)[0].id;
        state.awayPitcherId = '';
        state.homePitcherId = '';
        state.awayPitcherTouched = false;
        state.homePitcherTouched = false;
        state.simulation = null;
        state.aggregate = null;
        renderSelectors();
        renderResult(null);
    }

    function runSimulation() {
        var away = findTeamInPool(state.awayTeamId, state.awayPool);
        var home = findTeamInPool(state.homeTeamId, state.homePool);
        if (!away || !home || away.id === home.id) {
            setText('projectionNotice', 'Select two different teams to run a simulation. No output was generated.');
            return Promise.resolve(null);
        }
        renderLoading(away, home);
        setLiveInputsForMatchup(away, home);
        setText('projectionNotice', 'Loading verified MLB active roster names before rendering the player box score.');
        return Promise.all([
            ensureRostersForTeams(away, home),
            fetchBackendProjectionStatus(state.activeLiveContext),
            fetchLeagueSeasonStrength()
        ]).then(function () {
            setLiveInputsForMatchup(away, home);
            renderPitcherOptions('away', away, state.activeLiveContext);
            renderPitcherOptions('home', home, state.activeLiveContext);
            state.simulationCount = selectedSimulationCount();
            var count = state.simulationCount;
            var stamp = Date.now();
            var results = [];
            for (var i = 0; i < count; i += 1) {
                results.push(simulate(away, home, state.activeLiveContext, count === 1 ? 'single-' + stamp : 'batch-' + stamp + '-' + i, count > 1));
            }
            state.aggregate = count > 1 ? buildAggregate(results, away, home) : null;
            state.simulation = results[results.length - 1];
            renderResult(state.simulation);
            return state.simulation;
        });
    }
    function copyBoxScore() {
        if (!state.simulation) return;
        var text = boxScoreText(state.simulation);
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                setText('projectionNotice', 'Box score copied to clipboard.');
            }).catch(function () {
                setText('projectionNotice', 'Copy failed in this browser. Save Box Score is still available.');
            });
        } else {
            setText('projectionNotice', 'Clipboard copy is unavailable in this browser. Save Box Score is still available.');
        }
    }
    function saveBoxScore() {
        if (!state.simulation) return;
        var text = boxScoreText(state.simulation);
        var filename = boxScoreFilename(state.simulation);
        if (typeof Blob === 'undefined' || typeof window === 'undefined' || !window.URL || !document.createElement || !document.body) {
            setText('projectionNotice', 'File save is unavailable in this browser.');
            return;
        }
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setText('projectionNotice', 'Box score saved as ' + filename + '.');
    }
    function viewBoxScore(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (!state.simulation) {
            setText('projectionNotice', 'Run a simulation first. The box score appears automatically after a completed simulation.');
            return;
        }
        var panel = state.aggregate && state.aggregate.count > 1 ? byId('aggregatePanel') : byId('boxScorePanel');
        if (!panel) return;
        if (typeof panel.scrollIntoView === 'function') {
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (typeof window !== 'undefined') {
            window.location.hash = 'boxScorePanel';
        }
    }

    function normalizeBoardResponse(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.games)) return data.games;
        return [];
    }

    function loadLiveContext() {
        state.liveContext.status = 'loading';
        renderDataModeStatus();
        var base = apiBaseUrl();
        var espnUrls = recentEspnDates().map(function (date) {
            return 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=' + date;
        });
        fetchStatcastExpected();
        fetchTeamOaa();
        return Promise.allSettled([
            fetchJson(base + '/games?sport=baseball_mlb'),
            fetchJson(base + '/games/board/baseball_mlb')
        ].concat(espnUrls.map(fetchJson))).then(function (results) {
            var schedule = results[0].status === 'fulfilled' && results[0].value && Array.isArray(results[0].value.games) ? results[0].value.games : [];
            var board = results[1].status === 'fulfilled' ? normalizeBoardResponse(results[1].value) : [];
            var espnEventsByDate = results.slice(2).map(function (result) {
                return result.status === 'fulfilled' && result.value && Array.isArray(result.value.events) ? result.value.events.map(extractEspnEvent).filter(Boolean) : [];
            });
            var espnEvents = espnEventsByDate[0] || [];
            var recentEvents = espnEventsByDate.reduce(function (all, events) { return all.concat(events); }, []).filter(function (event) { return event && event.completed; });
            var summaryRequests = espnEvents.slice(0, 20).filter(function (event) { return event && event.id; }).map(function (event) {
                return fetchJson('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=' + encodeURIComponent(event.id)).then(function (summary) {
                    return { id: event.id, summary: summary };
                });
            });
            return Promise.allSettled(summaryRequests).then(function (summaryResults) {
                var summaries = {};
                summaryResults.forEach(function (result) {
                    if (result.status === 'fulfilled' && result.value && result.value.id) summaries[result.value.id] = result.value.summary;
                });
                state.liveContext = {
                    status: schedule.length || board.length || espnEvents.length ? 'available' : 'unavailable',
                    loadedAt: new Date().toISOString(),
                    scheduleGames: schedule,
                    boardGames: board,
                    espnEvents: espnEvents,
                    espnSummaries: summaries,
                    // ROSTER ACCURACY FIX (June 4, 2026): preserve ALL live caches, not
                    // just teamRosters. Replacing this object used to wipe playerStats /
                    // playerProfiles / playerSplits / todaySchedule / teamInjured, which
                    // (a) threw in in-flight fetch callbacks and (b) silently degraded
                    // lineup slots from real player stats to synthetic vectors.
                    teamRosters: state.liveContext.teamRosters || {},
                    playerStats: state.liveContext.playerStats || {},
                    playerProfiles: state.liveContext.playerProfiles || {},
                    playerSplits: state.liveContext.playerSplits || {},
                    todaySchedule: state.liveContext.todaySchedule || null,
                    teamInjured: state.liveContext.teamInjured || {},
                    statcast: state.liveContext.statcast || null,
                    teamOaa: state.liveContext.teamOaa || null,
                    recentEvents: recentEvents,
                    error: null
                };
                renderSelectors();
                if (state.simulation) {
                    var away = findTeamInPool(state.awayTeamId, state.awayPool);
                    var home = findTeamInPool(state.homeTeamId, state.homePool);
                    var count = state.simulationCount || 1;
                    var stamp = Date.now();
                    var results = [];
                    for (var i = 0; i < count; i += 1) {
                        results.push(simulate(away, home, state.activeLiveContext, count === 1 ? 'single-' + stamp : 'batch-' + stamp + '-' + i, count > 1));
                    }
                    state.aggregate = count > 1 ? buildAggregate(results, away, home) : null;
                    state.simulation = results[results.length - 1];
                    renderResult(state.simulation);
                }
            });
        }).catch(function (error) {
            state.liveContext.status = 'unavailable';
            state.liveContext.error = error && error.message || 'Live context unavailable';
            renderSelectors();
        });
    }

    function wireEvents() {
        var away = byId('awayTeamSelect');
        var home = byId('homeTeamSelect');
        var awayPool = byId('awayPoolSelect');
        var homePool = byId('homePoolSelect');
        var awayPitcherSelect = byId('awayPitcherSelect');
        var homePitcherSelect = byId('homePitcherSelect');
        var run = byId('runSimulationButton');
        var simulationCountSelect = byId('simulationCountSelect');
        var refresh = byId('refreshTeamsButton');
        var copyBox = byId('copyBoxScoreButton');
        var saveBox = byId('saveBoxScoreButton');
        var viewBox = byId('viewBoxScoreLink');
        var viewBoxControl = byId('viewBoxScoreControl');
        var current = byId('currentModeButton');
        var historical = byId('historicalModeButton');
        var mixed = byId('mixedModeButton');
        if (awayPool) awayPool.addEventListener('change', function () { state.awayPool = awayPool.value === 'historical' ? 'historical' : 'current'; state.preset = 'custom'; state.awayTeamId = poolTeams(state.awayPool)[0].id; state.awayPitcherId = ''; state.awayPitcherTouched = false; state.simulation = null; state.aggregate = null; renderSelectors(); renderResult(null); });
        if (homePool) homePool.addEventListener('change', function () { state.homePool = homePool.value === 'historical' ? 'historical' : 'current'; state.preset = 'custom'; state.homeTeamId = poolTeams(state.homePool)[0].id; state.homePitcherId = ''; state.homePitcherTouched = false; state.simulation = null; state.aggregate = null; renderSelectors(); renderResult(null); });
        if (away) away.addEventListener('change', function () { state.awayTeamId = away.value; state.awayPitcherId = ''; state.awayPitcherTouched = false; state.simulation = null; state.aggregate = null; renderSelectors(); renderResult(null); });
        if (home) home.addEventListener('change', function () { state.homeTeamId = home.value; state.homePitcherId = ''; state.homePitcherTouched = false; state.simulation = null; state.aggregate = null; renderSelectors(); renderResult(null); });
        if (awayPitcherSelect) awayPitcherSelect.addEventListener('change', function () {
            state.awayPitcherId = awayPitcherSelect.value;
            state.awayPitcherTouched = true;
            state.simulation = null;
            state.aggregate = null;
            renderPitcherOptions('away', findTeamInPool(state.awayTeamId, state.awayPool), state.activeLiveContext);
            renderResult(null);
        });
        if (homePitcherSelect) homePitcherSelect.addEventListener('change', function () {
            state.homePitcherId = homePitcherSelect.value;
            state.homePitcherTouched = true;
            state.simulation = null;
            state.aggregate = null;
            renderPitcherOptions('home', findTeamInPool(state.homeTeamId, state.homePool), state.activeLiveContext);
            renderResult(null);
        });
        if (run) run.addEventListener('click', runSimulation);
        if (simulationCountSelect) simulationCountSelect.addEventListener('change', function () { state.simulationCount = selectedSimulationCount(); });
        if (copyBox) copyBox.addEventListener('click', copyBoxScore);
        if (saveBox) saveBox.addEventListener('click', saveBoxScore);
        if (viewBox) viewBox.addEventListener('click', viewBoxScore);
        if (viewBoxControl) viewBoxControl.addEventListener('click', viewBoxScore);
        if (refresh) refresh.addEventListener('click', function () { switchMode('current'); });
        if (current) current.addEventListener('click', function () { switchMode('current'); });
        if (historical) historical.addEventListener('click', function () { switchMode('historical'); });
        if (mixed) mixed.addEventListener('click', function () { switchMode('mixed'); });
    }

    function init() {
        wireEvents();
        renderSelectors();
        renderResult(null);
        loadLiveContext();
        if (typeof window !== 'undefined' && window.location && /[?&]tmrAutoRun=ari-atl\b/.test(window.location.search || '')) {
            setTimeout(function () {
                state.awayPool = 'current';
                state.homePool = 'current';
                state.awayTeamId = 'current-ari';
                state.homeTeamId = 'current-atl';
                state.awayPitcherId = '';
                state.homePitcherId = '';
                renderSelectors();
                runSimulation();
            }, 350);
        }
    }

    window.TMRMlbSimulator = {
        uiBuild: UI_BUILD,
        state: state,
        localTeams: LOCAL_TEAMS,
        liveInputs: LIVE_INPUT_SOURCES,
        loadLiveContext: loadLiveContext,
        selectedLiveContext: selectedLiveContext,
        pitcherOptionsFor: pitcherOptionsFor,
        runSimulation: runSimulation,
        simulate: simulate,
        boxScoreText: boxScoreText,
        copyBoxScore: copyBoxScore,
        saveBoxScore: saveBoxScore,
        viewBoxScore: viewBoxScore,
        rosterSourceForTeam: rosterSourceForTeam,
        fetchTeamRoster: fetchTeamRoster,
        validatedRosterForTeam: validatedRosterForTeam,
        collectMlbTeamRoster: collectMlbTeamRoster,
        todaysLineupForTeam: todaysLineupForTeam,
        teamRosterUrl: teamRosterUrl,
        // LINEUP_INTEGRITY_20260722 verification hooks (read-only)
        collectRecentStartingLineup: collectRecentStartingLineup,
        startersBySlotFromBoxscore: startersBySlotFromBoxscore,
        fetchRecentStartingLineup: fetchRecentStartingLineup,
        fetchTodaysTransactions: fetchTodaysTransactions,
        fetchInjuredRoster: fetchInjuredRoster,
        lineupFreshnessNote: lineupFreshnessNote,
        lineupStatusFor: lineupStatusFor,
        // Test-only hook (additive, no runtime effect): lets the offline validation
        // harness drive the plate-appearance engine with controlled inputs and read
        // raw per-game accumulators for integrity + distribution calibration.
        _engine: {
            buildEventInputs: buildEventInputs,
            evSimGame: evSimGame,
            eventWinProbability: eventWinProbability,
            evActivePitcher: evActivePitcher,
            evRelieverArms: evRelieverArms,
            parkHrFactor: parkHrFactor,
            league: EV_LEAGUE,
            // TMR_EVENTLOG_20260723: event log + reducers, exposed so the offline
            // validators can fold a real game and assert every reconciliation rule.
            elNewLog: elNewLog,
            evPitchSequence: evPitchSequence,
            foldLineScore: foldLineScore,
            foldBatting: foldBatting,
            foldPitching: foldPitching,
            foldPlayByPlay: foldPlayByPlay,
            foldNotes: foldNotes,
            elReconcile: elReconcile,
            pitcherDecisions: pitcherDecisions,
            makeSyntheticBench: makeSyntheticBench,
            EL_INJURY: EL_INJURY,
            EL_EJECT: EL_EJECT,
            EL_TYPES: EL_TYPES
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
