(function () {
    'use strict';

    var UI_BUILD = 'mlb-simulator-pa-monte-carlo-engine-20260527b';
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

    var CURRENT_PITCHERS = {
        ARI: [['gallen', 'Zac Gallen', 112, 3.45], ['rodriguez', 'Eduardo Rodriguez', 102, 4.05], ['soroka', 'Michael Soroka', 100, 4.15], ['kelly', 'Merrill Kelly', 106, 3.75], ['nelson', 'Ryne Nelson', 100, 4.15]],
        ATL: [['sale', 'Chris Sale', 116, 3.25], ['strider', 'Spencer Strider', 115, 3.30], ['elder', 'Bryce Elder', 101, 4.10], ['holmes', 'Grant Holmes', 98, 4.30], ['ritchie', 'JR Ritchie', 96, 4.45]],
        BAL: [['rogers', 'Trevor Rogers', 102, 4.05], ['bradish', 'Kyle Bradish', 108, 3.70], ['baz', 'Shane Baz', 106, 3.80], ['bassitt', 'Chris Bassitt', 104, 3.95], ['kremer', 'Dean Kremer', 100, 4.20]],
        BOS: [['crochet', 'Garrett Crochet', 114, 3.35], ['gray', 'Sonny Gray', 109, 3.60], ['suarez', 'Ranger Suarez', 108, 3.65], ['early', 'Connelly Early', 95, 4.50], ['bello', 'Brayan Bello', 102, 4.05]],
        CHC: [['imanaga', 'Shota Imanaga', 110, 3.55], ['cabrera', 'Edward Cabrera', 102, 4.05], ['taillon', 'Jameson Taillon', 100, 4.20], ['rea', 'Colin Rea', 97, 4.35], ['wicks', 'Jordan Wicks', 96, 4.45]],
        CWS: [['burke', 'Sean Burke', 96, 4.45], ['fedde', 'Erick Fedde', 101, 4.10], ['kay', 'Anthony Kay', 92, 4.75], ['martin', 'Davis Martin', 94, 4.60], ['schultz', 'Noah Schultz', 98, 4.30]],
        CIN: [['lodolo', 'Nick Lodolo', 106, 3.80], ['abbott', 'Andrew Abbott', 103, 4.00], ['singer', 'Brady Singer', 100, 4.20], ['burns', 'Chase Burns', 101, 4.10], ['lowder', 'Rhett Lowder', 98, 4.30]],
        CLE: [['bibee', 'Tanner Bibee', 108, 3.65], ['cantillo', 'Joey Cantillo', 96, 4.45], ['cecconi', 'Slade Cecconi', 95, 4.50], ['messick', 'Parker Messick', 97, 4.35], ['williams', 'Gavin Williams', 104, 3.95]],
        COL: [['freeland', 'Kyle Freeland', 96, 4.45], ['lorenzen', 'Michael Lorenzen', 97, 4.35], ['quintana', 'Jose Quintana', 98, 4.30], ['sugano', 'Tomoyuki Sugano', 100, 4.20], ['feltner', 'Ryan Feltner', 96, 4.45]],
        DET: [['skubal', 'Tarik Skubal', 118, 3.15], ['valdez', 'Framber Valdez', 112, 3.45], ['flaherty', 'Jack Flaherty', 108, 3.65], ['mize', 'Casey Mize', 101, 4.10], ['verlander', 'Justin Verlander', 104, 3.95]],
        HOU: [['brown', 'Hunter Brown', 110, 3.55], ['imai', 'Tatsuya Imai', 104, 3.95], ['burrows', 'Mike Burrows', 94, 4.60], ['javier', 'Cristian Javier', 106, 3.80], ['mccullers', 'Lance McCullers Jr.', 102, 4.05]],
        KC: [['bubic', 'Kris Bubic', 101, 4.10], ['cameron', 'Noah Cameron', 97, 4.35], ['lugo', 'Seth Lugo', 109, 3.60], ['ragans', 'Cole Ragans', 113, 3.40], ['wacha', 'Michael Wacha', 103, 4.00]],
        LAA: [['soriano', 'Jose Soriano', 101, 4.10], ['detmers', 'Reid Detmers', 100, 4.20], ['grayson-rodriguez', 'Grayson Rodriguez', 106, 3.80], ['kochanowicz', 'Jack Kochanowicz', 96, 4.45], ['ryan-johnson', 'Ryan Johnson', 94, 4.60]],
        LAD: [['yamamoto', 'Yoshinobu Yamamoto', 114, 3.35], ['ohtani', 'Shohei Ohtani', 116, 3.25], ['snell', 'Blake Snell', 112, 3.45], ['glasnow', 'Tyler Glasnow', 113, 3.40], ['sheehan', 'Emmet Sheehan', 101, 4.10]],
        MIA: [['alcantara', 'Sandy Alcantara', 110, 3.55], ['perez', 'Eury Perez', 107, 3.70], ['meyer', 'Max Meyer', 101, 4.10], ['junk', 'Janson Junk', 94, 4.60], ['snelling', 'Robby Snelling', 98, 4.30]],
        MIL: [['misiorowski', 'Jacob Misiorowski', 104, 3.95], ['woodruff', 'Brandon Woodruff', 108, 3.65], ['harrison', 'Kyle Harrison', 99, 4.25], ['priester', 'Quinn Priester', 98, 4.30], ['patrick', 'Chad Patrick', 96, 4.45]],
        MIN: [['ryan', 'Joe Ryan', 108, 3.65], ['ober', 'Bailey Ober', 105, 3.90], ['bradley', 'Taj Bradley', 101, 4.10], ['woods-richardson', 'Simeon Woods Richardson', 99, 4.25], ['abel', 'Mick Abel', 97, 4.35]],
        NYM: [['peralta', 'Freddy Peralta', 109, 3.60], ['mclean', 'Nolan McLean', 98, 4.30], ['holmes', 'Clay Holmes', 101, 4.10], ['peterson', 'David Peterson', 103, 4.00], ['senga', 'Kodai Senga', 108, 3.65]],
        NYY: [['fried', 'Max Fried', 114, 3.35], ['cole', 'Gerrit Cole', 113, 3.40], ['rodon', 'Carlos Rodon', 107, 3.70], ['schlittler', 'Cam Schlittler', 96, 4.45], ['weathers', 'Ryan Weathers', 99, 4.25]],
        ATH: [['civale', 'Aaron Civale', 100, 4.20], ['ginn', 'J.T. Ginn', 95, 4.50], ['lopez', 'Jacob Lopez', 97, 4.35], ['severino', 'Luis Severino', 103, 4.00], ['springs', 'Jeffrey Springs', 104, 3.95]],
        PHI: [['luzardo', 'Jesus Luzardo', 107, 3.70], ['nola', 'Aaron Nola', 110, 3.55], ['painter', 'Andrew Painter', 103, 4.00], ['sanchez', 'Cristopher Sanchez', 109, 3.60], ['wheeler', 'Zack Wheeler', 116, 3.25]],
        PIT: [['skenes', 'Paul Skenes', 118, 3.15], ['keller', 'Mitch Keller', 102, 4.05], ['jones', 'Jared Jones', 104, 3.95], ['ashcraft', 'Braxton Ashcraft', 96, 4.45], ['chandler', 'Bubba Chandler', 99, 4.25]],
        SD: [['pivetta', 'Nick Pivetta', 104, 3.95], ['king', 'Michael King', 110, 3.55], ['musgrove', 'Joe Musgrove', 106, 3.80], ['vasquez', 'Randy Vasquez', 95, 4.50], ['giolito', 'Lucas Giolito', 100, 4.20]],
        SF: [['webb', 'Logan Webb', 113, 3.40], ['ray', 'Robbie Ray', 104, 3.95], ['roupp', 'Landen Roupp', 96, 4.45], ['mahle', 'Tyler Mahle', 102, 4.05], ['houser', 'Adrian Houser', 98, 4.30]],
        SEA: [['gilbert', 'Logan Gilbert', 111, 3.50], ['kirby', 'George Kirby', 112, 3.45], ['woo', 'Bryan Woo', 108, 3.65], ['castillo', 'Luis Castillo', 110, 3.55], ['miller', 'Bryce Miller', 106, 3.80]],
        STL: [['leahy', 'Kyle Leahy', 94, 4.60], ['liberatore', 'Matthew Liberatore', 98, 4.30], ['may', 'Dustin May', 103, 4.00], ['mcgreevy', 'Michael McGreevy', 96, 4.45], ['pallante', 'Andre Pallante', 97, 4.35]],
        TB: [['rasmussen', 'Drew Rasmussen', 108, 3.65], ['mcclanahan', 'Shane McClanahan', 114, 3.35], ['matz', 'Steven Matz', 98, 4.30], ['martinez', 'Nick Martinez', 101, 4.10], ['boyle', 'Joe Boyle', 96, 4.45]],
        TEX: [['degrom', 'Jacob deGrom', 118, 3.15], ['eovaldi', 'Nathan Eovaldi', 106, 3.80], ['gore', 'MacKenzie Gore', 105, 3.90], ['leiter', 'Jack Leiter', 98, 4.30], ['rocker', 'Kumar Rocker', 99, 4.25]],
        TOR: [['gausman', 'Kevin Gausman', 109, 3.60], ['cease', 'Dylan Cease', 110, 3.55], ['bieber', 'Shane Bieber', 108, 3.65], ['yesavage', 'Trey Yesavage', 98, 4.30], ['scherzer', 'Max Scherzer', 105, 3.90]],
        WSH: [['cavalli', 'Cade Cavalli', 97, 4.35], ['griffin', 'Foster Griffin', 94, 4.60], ['irvin', 'Jake Irvin', 100, 4.20], ['littell', 'Zack Littell', 98, 4.30], ['mikolas', 'Miles Mikolas', 99, 4.25]]
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

    var REPORTED_MISMATCHED_CURRENT_NAMES = {
        ARI: { nolanarenado: true }
    };
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
        ['bullpenContext', 'Bullpen context', 'Unavailable', 'No verified bullpen availability feed is connected.']
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
    function normalizeName(value) { return String(value || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, ''); }
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
        return fetch(url, { headers: { 'Accept': 'application/json' }, cache: options.cache || 'default' }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
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
    function todaysScheduleUrl() {
        return 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + encodeURIComponent(todayIsoLocal()) +
            '&hydrate=' + encodeURIComponent('probablePitcher,lineups,team,weather,venue') + '&_=' + encodeURIComponent(UI_BUILD);
    }
    function fetchTodaysSchedule() {
        if (state.liveContext.todaySchedule && state.liveContext.todaySchedule.uiBuild === UI_BUILD) return Promise.resolve(state.liveContext.todaySchedule);
        return fetchJson(todaysScheduleUrl(), { cache: 'no-store' }).then(function (data) {
            var games = (Array.isArray(data && data.dates) ? data.dates : []).reduce(function (all, day) {
                return all.concat(Array.isArray(day && day.games) ? day.games : []);
            }, []);
            state.liveContext.todaySchedule = { uiBuild: UI_BUILD, games: games };
            return state.liveContext.todaySchedule;
        }).catch(function () {
            state.liveContext.todaySchedule = { uiBuild: UI_BUILD, games: [] };
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
            gamePk: found.game.gamePk || null
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
            if (split && Number(split.ops) > 0 && Number(split.plateAppearances) >= 25) {
                splitCount += 1;
                return split;
            }
            var season = cachedPlayerStat(p.mlbId, 'hitting');
            return season && Number(season.ops) > 0 && Number(season.plateAppearances) >= 30 ? season : null;
        }).filter(Boolean);
        if (stats.length < 6) return null;
        var meanOps = stats.reduce(function (sum, s) { return sum + Number(s.ops); }, 0) / stats.length;
        return {
            meanOps: meanOps,
            sampleSize: stats.length,
            splitCount: splitCount,
            vsHand: opposingHand || null,
            factor: clamp(1 + (meanOps - 0.720) * 0.55, 0.85, 1.15)
        };
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
            state.liveContext.playerStats[cacheKey] = stat;
            return stat;
        }).catch(function () {
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
            state.liveContext.playerProfiles[playerId] = p;
            return p;
        }).catch(function () {
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
            state.liveContext.playerSplits[key] = byCode;
            return byCode;
        }).catch(function () {
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
        if (recentLineup && Array.isArray(recentLineup.players) && recentLineup.players.length >= 9) {
            var activeByName = {};
            players.forEach(function (player) { activeByName[normalizeName(player.name)] = player; });
            // The lineup feed (today's posted/confirmed lineup, or the most recent game's
            // batting order) is itself the source of truth for the order. Enrich each slot
            // with active-roster metadata (mlbId/position) when names match, but do NOT drop
            // a real lineup hitter just because the active-roster name string differs.
            orderedHitters = recentLineup.players.slice(0, 9).map(function (player, index) {
                var active = activeByName[normalizeName(player.name)];
                return Object.assign({}, active || {}, {
                    name: player.name,
                    position: player.position || (active && active.position) || '',
                    teamId: String(expectedId || ''),
                    battingOrder: (index + 1) * 100,
                    mlbId: player.mlbId || (active && active.mlbId) || null
                });
            }).filter(function (player) { return player.name && !playerBlockedForTeam(team, player.name); });
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
        return validatedRosterForTeam(team, {
            teamId: String(expectedId || ''),
            count: players.length,
            relievers: pitchers.length,
            players: hitters.concat(pitchers),
            summary: players.length + ' MLB active roster players',
            source: labels.source,
            lineupSource: labels.lineupSource,
            lineupStatus: lineupStatus,
            lineupBadge: labels.badge,
            lineupConfirmed: lineupConfirmed
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
        var teamId = String(MLB_TEAM_IDS[team && team.abbreviation] || '');
        if (String(game && game.teams && game.teams.home && game.teams.home.team && game.teams.home.team.id || '') === teamId) return 'home';
        if (String(game && game.teams && game.teams.away && game.teams.away.team && game.teams.away.team.id || '') === teamId) return 'away';
        return '';
    }
    function latestFinalGame(data, team) {
        var games = [];
        (Array.isArray(data && data.dates) ? data.dates : []).forEach(function (date) {
            (Array.isArray(date && date.games) ? date.games : []).forEach(function (game) {
                if (teamSideInGame(game, team) && game.status && game.status.abstractGameState === 'Final') games.push(game);
            });
        });
        games.sort(function (a, b) { return new Date(b.gameDate || b.officialDate || 0).getTime() - new Date(a.gameDate || a.officialDate || 0).getTime(); });
        return games[0] || null;
    }
    function playerFromBoxscore(boxTeam, feed, id) {
        var key = 'ID' + id;
        var row = boxTeam && boxTeam.players && boxTeam.players[key] || null;
        var gamePlayer = feed && feed.gameData && feed.gameData.players && feed.gameData.players[key] || null;
        var person = row && row.person || gamePlayer || {};
        var position = row && row.position || person.primaryPosition || {};
        return {
            name: person.fullName || person.nameFirstLast || person.boxscoreName || '',
            position: position.abbreviation || position.name || '',
            teamId: ''
        };
    }
    function collectRecentStartingLineup(feed, team) {
        var side = teamSideInGame(feed && feed.gameData, team);
        var boxTeam = side && feed && feed.liveData && feed.liveData.boxscore && feed.liveData.boxscore.teams && feed.liveData.boxscore.teams[side];
        var order = Array.isArray(boxTeam && boxTeam.battingOrder) ? boxTeam.battingOrder : [];
        var teamId = String(MLB_TEAM_IDS[team && team.abbreviation] || '');
        var players = order.slice(0, 9).map(function (id, index) {
            var player = playerFromBoxscore(boxTeam, feed, id);
            player.teamId = teamId;
            player.battingOrder = (index + 1) * 100;
            player.mlbId = id || null;
            return player;
        }).filter(function (player) { return player.name && playerBelongsToTeam(player, team); });
        return players.length >= 9 ? { players: players, source: 'Most recent game starting lineup (projected)', confirmed: false, lineupStatus: 'recent' } : null;
    }
    function fetchRecentStartingLineup(team) {
        return fetchTodaysSchedule().then(function (sched) {
            var todays = todaysLineupForTeam(sched.games, team);
            if (todays && Array.isArray(todays.players) && todays.players.length >= 9) return todays;
            var url = recentLineupUrl(team);
            if (!url) return null;
            return fetchJson(url, { cache: 'no-store' }).then(function (schedule) {
                var game = latestFinalGame(schedule, team);
                if (!game || !game.link) return null;
                var feedUrl = /^https?:\/\//.test(game.link) ? game.link : 'https://statsapi.mlb.com' + game.link;
                return fetchJson(feedUrl, { cache: 'no-store' }).then(function (feed) { return collectRecentStartingLineup(feed, team); });
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
        if (!roster) return;
        if (roster.todayProbableStarter && roster.todayProbableStarter.id) {
            fetchPlayerSeasonStats(roster.todayProbableStarter.id, 'pitching');
            fetchPlayerProfile(roster.todayProbableStarter.id);
        }
        var players = Array.isArray(roster.players) ? roster.players : [];
        players.slice(0, 9).forEach(function (p) {
            if (p && p.mlbId) {
                fetchPlayerSeasonStats(p.mlbId, 'hitting');
                fetchPlayerSplits(p.mlbId, 'hitting');
            }
        });
        var pitchers = players.filter(function (p) {
            return p && p.mlbId && /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(p.position || ''));
        }).slice(0, 14);
        pitchers.forEach(function (p) { fetchPlayerSeasonStats(p.mlbId, 'pitching'); });
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
        if (state.liveContext.teamRosters[team.abbreviation] && state.liveContext.teamRosters[team.abbreviation].uiBuild === UI_BUILD) return Promise.resolve(state.liveContext.teamRosters[team.abbreviation]);
        var url = teamRosterUrl(team);
        if (!url) return Promise.resolve(null);
        return Promise.all([
            fetchJson(url, { cache: 'no-store' }),
            fetchRecentStartingLineup(team),
            fetchTodaysSchedule()
        ]).then(function (results) {
            var roster = collectMlbTeamRoster(results[0], team, results[1]);
            var probable = results[2] ? todaysProbableStarterForTeam(results[2].games, team) : null;
            if (roster) {
                roster.uiBuild = UI_BUILD;
                roster.todayProbableStarter = probable || null;
            }
            state.liveContext.teamRosters[team.abbreviation] = roster;
            prefetchPlayerStatsForRoster(roster);
            fetchInjuredRoster(team);
            return roster;
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
            addOption({
                id: pitcherId(side, 'today-' + slugify(todayProbable.name)),
                name: todayProbable.name,
                quality: pitcherQualityFromEra(realEra),
                era: Number.isFinite(realEra) ? realEra : null,
                source: "Today's confirmed MLB probable starter",
                verified: true,
                confirmed: true,
                mlbId: todayProbable.id || null,
                note: pitchStat
                    ? ('Real ' + seasonYear() + ' season ERA ' + (Number.isFinite(realEra) ? realEra.toFixed(2) : 'N/A') + ', WHIP ' + (pitchStat.whip || 'N/A') + ', ' + (pitchStat.wins || 0) + '-' + (pitchStat.losses || 0))
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
            return curatedPitchers.map(function (row) {
                return {
                    id: pitcherId(side, team.id + '-' + row[0]),
                    name: row[1],
                    quality: row[2],
                    era: row[3],
                    source: 'Current simulator starter profile',
                    verified: false,
                    note: 'Baseline current-team starter profile; active roster feed unavailable'
                };
            });
        }
        if (!rosterRows.length && !options.length) return [];
        var limit = options.length >= 2 ? 3 : (options.length === 1 ? 4 : 5);
        rosterRows.slice(0, limit).forEach(function (player) {
            var row = curatedMatch(player.name);
            var stat = player.mlbId ? cachedPlayerStat(player.mlbId, 'pitching') : null;
            var realEra = stat ? Number(stat.era) : null;
            var hasReal = Number.isFinite(realEra);
            addOption({
                id: pitcherId(side, team.id + '-' + slugify(player.name)),
                name: player.name,
                quality: hasReal ? pitcherQualityFromEra(realEra) : (row ? row[2] : 100),
                era: hasReal ? realEra : (row ? row[3] : null),
                source: hasReal ? (verifiedRoster.source + ' plus real ' + seasonYear() + ' season pitching stats') : verifiedRoster.source,
                verified: true,
                mlbId: player.mlbId || null,
                note: hasReal
                    ? ('Real ' + seasonYear() + ' season ERA ' + realEra.toFixed(2) + ', WHIP ' + (stat.whip || 'N/A') + ', ' + (stat.wins || 0) + '-' + (stat.losses || 0))
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
        return match ? match[1].replace(/\s+/g, '') : 'N/A';
    }
    function pitcherOptionLabel(pitcher) {
        return pitcher.name + ', ERA ' + (pitcher.era != null ? pitcher.era : 'N/A') + ', W-L ' + pitcherRecord(pitcher);
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
        if (Number.isFinite(weather.gust) && weather.gust >= 18) adjustment += 0.04;
        if (Number.isFinite(weather.precipitation) && weather.precipitation > 0) adjustment -= 0.08;
        return clamp(adjustment, -0.16, 0.18);
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
            var seasonOk = seasonStat && Number.isFinite(Number(seasonStat.ops)) && seasonPa >= 30;
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
            var hrCount = seasonStat ? Number(seasonStat.homeRuns || 0) : 0;
            var hrRateSeason = seasonOk && Number(seasonStat.atBats) > 0 ? hrCount / Number(seasonStat.atBats) : null;
            return {
                name: player.name,
                position: playerPositionLabel(player),
                mlbId: player.mlbId || null,
                batSide: player && player.mlbId ? batSideOf(player.mlbId) : null,
                ops: hasReal ? Number(stat.ops) : null,
                avg: hasReal ? Number(stat.avg) : null,
                slg: hasReal ? Number(stat.slg) : null,
                hr: hrCount,
                ab: hasReal ? Number(stat.atBats || 0) : 0,
                pa: hasReal ? Number(stat.plateAppearances || 0) : 0,
                hrRate: hrRateSeason,
                kRate: hasReal && Number(stat.plateAppearances) > 0 ? Number(stat.strikeOuts || 0) / Number(stat.plateAppearances) : null,
                bbRate: hasReal && Number(stat.plateAppearances) > 0 ? Number(stat.baseOnBalls || 0) / Number(stat.plateAppearances) : null,
                real: hasReal,
                statSource: source,
                vsHand: opposingHand || null
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
            var displayAvg = statRow && statRow.real && statRow.avg != null ? statRow.avg : gameAvg;
            var displayOps = statRow && statRow.real && statRow.ops != null ? statRow.ops : clamp(displayAvg * 2.55 + 0.18, 0.45, 1.25);
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
                statSource: statRow && statRow.real ? ((statRow.statSource === 'split' && statRow.vsHand ? ('Real ' + seasonYear() + ' vs ' + statRow.vsHand + 'HP OPS ' + statRow.ops.toFixed(3) + ' / AVG ' + statRow.avg.toFixed(3)) : ('Real ' + seasonYear() + ' season OPS ' + statRow.ops.toFixed(3) + ' / AVG ' + statRow.avg.toFixed(3))) + (statRow.hrRate != null ? ' / HR ' + statRow.hr : '')) : null
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
            confirmed: !!roster.lineupConfirmed
        };
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
    function pitcherDecisions(rows, isWinner) {
        var labels = (rows || []).map(function () { return ''; });
        if (!rows || !rows.length) return labels;
        if (isWinner) {
            var wIdx = Number(rows[0].outs || 0) >= 15 ? 0 : (rows.length > 1 ? 1 : 0);
            labels[wIdx] = 'W';
            if (rows.length > 1) {
                var last = rows.length - 1;
                if (last !== wIdx) labels[last] = 'SV';
                else if (rows.length > 2) labels[rows.length - 2] = 'SV';
            }
        } else {
            labels[0] = 'L';
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
            k9 = Number(stat.strikeOuts || 0) / ip * 9;
            bb9 = Number(stat.baseOnBalls || 0) / ip * 9;
            hr9 = Number(stat.homeRuns || 0) / ip * 9;
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
    function evCombine(bv, pv) {
        function orc(b, p, l) { return evFromOdds(evOdds(b) * evOdds(p) / evOdds(l)); }
        var hf = pv && pv.hitFactor != null ? pv.hitFactor : 1;
        return evNormalize({
            bb: orc(bv.bb, pv.bb, EV_LEAGUE.bb),
            so: orc(bv.so, pv.so, EV_LEAGUE.so),
            hr: orc(bv.hr, pv.hr, EV_LEAGUE.hr),
            b3: bv.b3 * hf, b2: bv.b2 * hf, b1: bv.b1 * hf, out: Math.max(0.02, bv.out)
        });
    }
    function evScale(v, f) {
        var nv = { bb: v.bb * f, so: v.so, hr: v.hr * f, b3: v.b3 * f, b2: v.b2 * f, b1: v.b1 * f, out: v.out };
        var posOld = v.bb + v.hr + v.b3 + v.b2 + v.b1, posNew = nv.bb + nv.hr + nv.b3 + nv.b2 + nv.b1;
        nv.out = Math.max(0.02, v.out + (posOld - posNew));
        return evNormalize(nv);
    }
    function evAnchorFactor(combinedVectors, targetRuns) {
        var target = clamp(targetRuns, 1.4, 11) * 0.985;
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
    function evNewBat() { return { pa: 0, ab: 0, h: 0, b2: 0, b3: 0, hr: 0, bb: 0, so: 0, r: 0, rbi: 0 }; }
    function evNewPit() { return { outs: 0, h: 0, bb: 0, so: 0, hr: 0, r: 0, er: 0 }; }
    // Build per-team lineup (anchored batter vectors + display rows) and staff.
    function evBuildSide(team, oppPitcher, ownStarter, targetRuns, rosterContext) {
        var roster = rosterForTeam(team, rosterContext);
        var oppHand = oppPitcher && oppPitcher.mlbId ? pitchHandOf(oppPitcher.mlbId) : null;
        var slotStats = roster ? rosterBatterSlotStats(roster, oppHand) : [];
        var names = roster ? rosterNamesForBatters(roster) : [];
        var oppVec = evPitcherVector(oppPitcher, 100);
        var lineup = [];
        for (var i = 0; i < 9; i++) {
            var s = slotStats[i];
            var baseVec = (s && s.real) ? evBatterVector(s) : evSyntheticVector(team && team.offense, i);
            var plainName = (s && s.name) || (names[i] ? names[i].replace(/\s*\([^)]*\)\s*$/, '') : '');
            var rawPos = (s && s.position) || ((names[i] || '').match(/\(([A-Z0-9]+)\)\s*$/) || [null, ''])[1];
            lineup.push({
                baseVec: baseVec,
                playerName: plainName,
                name: (s && s.name && (s.position ? s.name + ' (' + s.position + ')' : s.name)) || names[i] || '',
                rawPos: rawPos,
                realAvg: (s && s.real && s.avg != null) ? s.avg : null,
                realOps: (s && s.real && s.ops != null) ? s.ops : null,
                statSource: (s && s.real) ? ((s.statSource === 'split' && s.vsHand ? ('Real ' + seasonYear() + ' vs ' + s.vsHand + 'HP') : ('Real ' + seasonYear() + ' season')) + ' OPS ' + Number(s.ops).toFixed(3)) : null,
                acc: evNewBat()
            });
        }
        var combinedForAnchor = lineup.map(function (b) { return evCombine(b.baseVec, oppVec); });
        var anchorFactor = evAnchorFactor(combinedForAnchor, targetRuns);
        // pitching staff: own starter (faces opponent) -> set up -> closer
        var staffNames = roster ? rosterNamesForPitchers(roster, ownStarter) : (ownStarter && ownStarter.name ? [ownStarter.name] : []);
        var starterVec = evPitcherVector(ownStarter, 100);
        var penVec = evStaffVector(team, true);
        var starterOuts = evStarterOuts(ownStarter, team);
        var pitchers = [
            { name: staffNames[0] || (ownStarter && ownStarter.name) || (team.abbreviation + ' SP'), vec: starterVec, acc: evNewPit(), role: 'SP' },
            { name: staffNames[1] || (team.abbreviation + ' RP'), vec: penVec, acc: evNewPit(), role: 'RP' },
            { name: staffNames[2] || (team.abbreviation + ' CL'), vec: penVec, acc: evNewPit(), role: 'CL' }
        ];
        return {
            team: team, lineup: lineup, anchorFactor: anchorFactor, pitchers: pitchers,
            starterOuts: starterOuts, roster: roster, hasNamedLineup: !!(roster && roster.players && roster.players.length),
            errRate: clamp(0.017 + (100 - (team && team.runPrevention || 100)) * 0.0006, 0.008, 0.032)
        };
    }
    function evStarterOuts(starter, team) {
        var quality = Number(starter && starter.quality); if (!Number.isFinite(quality)) quality = 100;
        var era = Number(starter && starter.era);
        var stat = starter && starter.mlbId ? cachedPlayerStat(starter.mlbId, 'pitching') : null;
        if (stat) {
            var ip = Number(String(stat.inningsPitched || '0')); var gs = Number(stat.gamesStarted || 0);
            if (ip > 0 && gs > 0) return clamp(Math.round((ip / gs) * 3), 12, 22);
        }
        var outs = 18 + (quality - 100) * 0.10;
        if (Number.isFinite(era)) outs += (4.2 - era) * 0.9;
        return clamp(Math.round(outs), 11, 22);
    }
    // Simulate one half inning for `bat` side against the active pitcher object.
    function evPlayHalf(side, pitcher, random) {
        var lineup = side.lineup, outs = 0, bases = [null, null, null], runs = 0, errors = 0;
        function score(slot, earned) { lineup[slot].acc.r++; runs++; pitcher.acc.r++; if (earned) pitcher.acc.er++; }
        while (outs < 3) {
            var bi = side.idx % 9, b = lineup[bi];
            var v = evScale(evCombine(b.baseVec, pitcher.vec), side.anchorFactor);
            var ev = evSample(v, random), acc = b.acc; acc.pa++;
            var rbi = 0;
            if (ev === 'bb') {
                acc.bb++; pitcher.acc.bb++;
                if (bases[0] !== null) { if (bases[1] !== null) { if (bases[2] !== null) { score(bases[2], true); rbi++; } bases[2] = bases[1]; } bases[1] = bases[0]; }
                bases[0] = bi;
            } else if (ev === 'so') { acc.ab++; acc.so++; pitcher.acc.so++; pitcher.acc.outs++; outs++;
            } else if (ev === 'hr') {
                acc.ab++; acc.h++; acc.hr++; pitcher.acc.h++; pitcher.acc.hr++;
                for (var k = 0; k < 3; k++) { if (bases[k] !== null) { score(bases[k], true); rbi++; bases[k] = null; } }
                score(bi, true); rbi++;
            } else if (ev === 'b3') {
                acc.ab++; acc.h++; acc.b3++; pitcher.acc.h++;
                for (var k2 = 0; k2 < 3; k2++) { if (bases[k2] !== null) { score(bases[k2], true); rbi++; bases[k2] = null; } }
                bases[2] = bi;
            } else if (ev === 'b2') {
                acc.ab++; acc.h++; acc.b2++; pitcher.acc.h++;
                if (bases[2] !== null) { score(bases[2], true); rbi++; bases[2] = null; }
                if (bases[1] !== null) { score(bases[1], true); rbi++; bases[1] = null; }
                if (bases[0] !== null) { if (random() < 0.40) { score(bases[0], true); rbi++; } else { bases[2] = bases[0]; } bases[0] = null; }
                bases[1] = bi;
            } else if (ev === 'b1') {
                acc.ab++; acc.h++; acc.b1++; pitcher.acc.h++;
                if (bases[2] !== null) { score(bases[2], true); rbi++; bases[2] = null; }
                if (bases[1] !== null) { if (random() < 0.60) { score(bases[1], true); rbi++; } else { bases[2] = bases[1]; } bases[1] = null; }
                if (bases[0] !== null) { if (random() < 0.28 && bases[2] === null) { bases[2] = bases[0]; } else { bases[1] = bases[0]; } bases[0] = null; }
                bases[0] = bi;
            } else { // out in play, with a small chance of a reach-on-error (unearned)
                if (random() < side.errRate) {
                    errors++; // batter reaches as if a single but no hit, runs charged unearned
                    if (bases[2] !== null) { score(bases[2], false); bases[2] = null; }
                    if (bases[1] !== null) { bases[2] = bases[1]; bases[1] = null; }
                    if (bases[0] !== null) { bases[1] = bases[0]; }
                    bases[0] = bi; acc.ab++;
                } else {
                    acc.ab++; pitcher.acc.outs++;
                    if (outs < 2 && bases[2] !== null && random() < 0.25) { score(bases[2], true); rbi++; bases[2] = null; outs++; }
                    else if (outs < 2 && bases[0] !== null && random() < 0.11) { outs += 2; pitcher.acc.outs++; bases[0] = null; }
                    else outs++;
                }
            }
            acc.rbi += rbi;
            side.idx++;
        }
        side.lob = (side.lob || 0) + bases.filter(function (x) { return x !== null; }).length;
        return { runs: runs, errors: errors };
    }
    function evActivePitcher(side, outsRecorded) {
        if (outsRecorded < side.starterOuts) return side.pitchers[0];
        var relief = 27 - side.starterOuts;
        if (outsRecorded < side.starterOuts + Math.ceil(relief * 0.6)) return side.pitchers[1];
        return side.pitchers[2];
    }
    function evSimGame(awaySide, homeSide, random) {
        awaySide.idx = 0; awaySide.lob = 0; homeSide.idx = 0; homeSide.lob = 0;
        awaySide.lineup.forEach(function (b) { b.acc = evNewBat(); });
        homeSide.lineup.forEach(function (b) { b.acc = evNewBat(); });
        awaySide.pitchers.forEach(function (p) { p.acc = evNewPit(); });
        homeSide.pitchers.forEach(function (p) { p.acc = evNewPit(); });
        var aRuns = 0, hRuns = 0, aErr = 0, hErr = 0, aInn = [], hInn = [];
        for (var inn = 0; inn < 9; inn++) {
            var ap = evActivePitcher(homeSide, sumOuts(homeSide));
            var ra = evPlayHalf(awaySide, ap, random); aRuns += ra.runs; hErr += ra.errors; aInn.push(ra.runs);
            if (inn === 8 && hRuns > aRuns) { break; }
            var hp = evActivePitcher(awaySide, sumOuts(awaySide));
            var rh = evPlayHalf(homeSide, hp, random); hRuns += rh.runs; aErr += rh.errors; hInn.push(rh.runs);
        }
        var extra = 9;
        while (aRuns === hRuns && extra < 18) {
            var ap2 = evActivePitcher(homeSide, sumOuts(homeSide));
            var rae = evPlayHalf(awaySide, ap2, random); aRuns += rae.runs; hErr += rae.errors;
            var hp2 = evActivePitcher(awaySide, sumOuts(awaySide));
            var rhe = evPlayHalf(homeSide, hp2, random); hRuns += rhe.runs; aErr += rhe.errors;
            extra++;
        }
        return { aRuns: aRuns, hRuns: hRuns, aInn: aInn, hInn: hInn, aErr: aErr, hErr: hErr, extra: extra };
    }
    function sumOuts(side) { return side.pitchers.reduce(function (t, p) { return t + p.acc.outs; }, 0); }

    function buildBoxScore(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, awayWin, homeWin, seedSalt, allowUpset, rosterContext, eventInputs) {
        var random = Math.random;
        var inputs = eventInputs || buildEventInputs(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, rosterContext);
        return assembleEventBoxScore(inputs, away, home, awayPitcher, homePitcher, random);
    }
    function buildEventInputs(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, rosterContext) {
        var awaySide = evBuildSide(away, homePitcher, awayPitcher, awayRuns, rosterContext && rosterContext.away);
        var homeSide = evBuildSide(home, awayPitcher, homePitcher, homeRuns, rosterContext && rosterContext.home);
        return { awaySide: awaySide, homeSide: homeSide };
    }
    function eventWinProbability(inputs, samples) {
        var homeWins = 0, total = 0;
        for (var i = 0; i < samples; i++) {
            var g = evSimGame(inputs.awaySide, inputs.homeSide, Math.random);
            if (g.hRuns > g.aRuns) homeWins++;
            else if (g.aRuns > g.hRuns) { /* away */ } else homeWins += 0.5;
            total++;
        }
        return total ? homeWins / total : 0.5;
    }
    function evBatterRows(side) {
        return side.lineup.map(function (b) {
            var a = b.acc;
            var gameAvg = a.ab > 0 ? a.h / a.ab : 0;
            var displayAvg = b.realAvg != null ? b.realAvg : gameAvg;
            var displayOps = b.realOps != null ? b.realOps : clamp(displayAvg * 2.55 + 0.18, 0.45, 1.25);
            return {
                name: b.name, playerName: b.playerName, rawPos: b.rawPos,
                ab: a.ab, r: a.r, h: a.h, hr: a.hr, rbi: a.rbi, bb: a.bb, so: a.so,
                b2: a.b2, b3: a.b3, avg: displayAvg, ops: displayOps, statSource: b.statSource
            };
        }).filter(function (row) { return row.name; });
    }
    function evPitcherRows(side) {
        return side.pitchers.filter(function (p) { return p.acc.outs > 0 || p.acc.h > 0 || p.acc.bb > 0; }).map(function (p) {
            var a = p.acc;
            return { name: p.name, outs: a.outs, ip: outsToIp(a.outs), h: a.h, r: a.r, er: Math.min(a.r, a.er), bb: a.bb, so: a.so, hr: a.hr };
        });
    }
    function evSummaryStats(side, runs, hits, errors, random) {
        var rows = side.lineup.map(function (b) { return b.acc; });
        var doubles = sum(rows.map(function (r) { return r.b2; }));
        var triples = sum(rows.map(function (r) { return r.b3; }));
        var homeRuns = sum(rows.map(function (r) { return r.hr; }));
        var rbi = sum(rows.map(function (r) { return r.rbi; }));
        var walks = sum(rows.map(function (r) { return r.bb; }));
        var strikeouts = sum(rows.map(function (r) { return r.so; }));
        var singles = Math.max(0, hits - doubles - triples - homeRuns);
        var totalBases = singles + doubles * 2 + triples * 3 + homeRuns * 4;
        var leftOnBase = side.lob || 0;
        var rispChances = clamp(Math.round(hits * 0.5) + 2, 1, 16);
        var rispHits = clamp(Math.round(runs * 0.45), 0, rispChances);
        var stolenBases = clamp(Math.round((hits + walks) * 0.06), 0, 4);
        var caughtStealing = stolenBases > 1 && random() < 0.5 ? 1 : 0;
        var totalPitches = 0, totalStrikes = 0;
        side.pitchers.forEach(function (p) {
            if (p.acc.outs <= 0 && p.acc.h <= 0 && p.acc.bb <= 0) return;
            var pc = pitcherPitchCount({ outs: p.acc.outs, h: p.acc.h, bb: p.acc.bb, so: p.acc.so });
            totalPitches += pc.pitches; totalStrikes += pc.strikes;
        });
        return {
            doubles: doubles, triples: triples, homeRuns: homeRuns, rbi: rbi, walks: walks, strikeouts: strikeouts,
            stolenBases: stolenBases, caughtStealing: caughtStealing, leftOnBase: leftOnBase,
            totalPitches: totalPitches, totalStrikes: totalStrikes, hits: hits, runs: runs, errors: errors,
            totalBases: totalBases, twoOutRbi: clamp(Math.round(rbi * 0.4), 0, rbi),
            lispLeft2Out: clamp(Math.round(hits * 0.12) + 1, 0, 5), gidp: clamp(Math.round(hits / 6), 0, 3),
            rispText: rispHits + '-for-' + rispChances, pickoffs: random() < 0.12 ? 1 : 0,
            outfieldAssists: random() < 0.18 ? 1 : 0, dp: clamp(Math.round((27 - runs) / 18) + (random() < 0.4 ? 1 : 0), 0, 3)
        };
    }
    function assembleEventBoxScore(inputs, away, home, awayPitcher, homePitcher, random) {
        var g = evSimGame(inputs.awaySide, inputs.homeSide, random);
        var awayHits = sum(inputs.awaySide.lineup.map(function (b) { return b.acc.h; }));
        var homeHits = sum(inputs.homeSide.lineup.map(function (b) { return b.acc.h; }));
        var awayInnings = evPadInnings(g.aInn, g.aRuns);
        var homeInnings = evPadInnings(g.hInn, g.hRuns);
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
        return {
            runId: String(Date.now()) + '-' + Math.floor(random() * 1000000),
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
    function evPadInnings(innArr, totalRuns) {
        var innings = innArr.slice(0, 9);
        while (innings.length < 9) innings.push(0);
        var shown = innings.reduce(function (t, x) { return t + x; }, 0);
        if (shown < totalRuns) innings[8] += (totalRuns - shown); // fold extra-inning runs into the 9th column for the fixed 9-column line
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
            { key: 'bullpenContext', label: 'Bullpen context', status: bullpenAvailable ? 'Bullpen injury/depth context available' : 'Unavailable', detail: bullpenAvailable ? 'Derived from ESPN roster/injury context only; workload and availability are not connected.' : 'No verified bullpen depth, workload, or availability feed is connected.', verified: bullpenAvailable }
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

    function starterEraAdjustment(starter) {
        if (!starter || !Number.isFinite(starter.era)) return 0;
        return clamp((starter.era - 4.2) * 0.16, -0.32, 0.48);
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
        // Home-field run environment: home clubs historically score slightly MORE
        // (last at-bat, familiarity, platoon), not less. Give home the larger
        // run bonus (~+0.16 net over road) instead of the prior inverted values.
        var awayRuns = expectedRunsFor(away, home, 0.08);
        var homeRuns = expectedRunsFor(home, away, 0.24);
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
        if (context && context.odds) {
            var awayImp = impliedFromAmerican(context.odds.awayPrice);
            var homeImp = impliedFromAmerican(context.odds.homePrice);
            if (awayImp != null && homeImp != null) {
                var noVigHome = homeImp / (homeImp + awayImp);
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
        var eventInputs = buildEventInputs(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, rosterContext);
        // Win probability is the simulated frequency from the same plate-appearance
        // engine that produces the box score, so the displayed win % and the box
        // scores are one consistent model. The run-based blend above is the fallback.
        var wpSamples = state.simulationCount > 1 ? 90 : 300;
        var simHomeWin = eventWinProbability(eventInputs, wpSamples);
        homeWin = clamp(Number.isFinite(simHomeWin) ? simHomeWin : homeWin, 0.05, 0.95);
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

    function renderDataModeStatus() {
        var verifiedCount = verifiedLiveInputs().length;
        setText('simDataSourceTitle', verifiedCount ? 'Verified input mode' : 'Baseline ratings mode');
        setText('simDataSourceDetail', verifiedCount ? 'Using verified live inputs where available plus baseline ratings.' : 'Using internal baseline team ratings and historical context only.');
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
    function boxRow(line, winnerId) {
        var isWinner = line.team.id === winnerId;
        return '<tr class="' + (isWinner ? 'winner-row' : '') + '"><th scope="row">' + escapeHtml(line.team.abbreviation) + '</th>' +
            line.innings.map(function (runs) { return '<td>' + runs + '</td>'; }).join('') +
            '<td class="total-runs">' + line.runs + '</td><td>' + line.hits + '</td><td>' + line.errors + '</td></tr>';
    }
    function fmt3(value) { return Number(value || 0).toFixed(3); }
    function gameEra(row) {
        var outs = Number(row.outs || 0);
        if (!outs) return '-';
        return (Number(row.er || 0) * 27 / outs).toFixed(2);
    }
    function batterTableRows(rows) {
        var positions = assignLineupPositions(rows);
        var lineup = rows.slice(0, 9);
        var totals = { ab: 0, r: 0, h: 0, rbi: 0, bb: 0, so: 0 };
        var body = lineup.map(function (row, index) {
            totals.ab += row.ab; totals.r += row.r; totals.h += row.h; totals.rbi += row.rbi; totals.bb += row.bb; totals.so += row.so;
            var name = (row.playerName || String(row.name || '').replace(/\s*\([^)]*\)\s*$/, '')) + ' (' + positions[index] + ')';
            return '<tr><th scope="row">' + escapeHtml(name) + '</th><td>' + row.ab + '</td><td>' + row.r + '</td><td>' + row.h + '</td><td>' + row.rbi + '</td><td>' + row.bb + '</td><td>' + row.so + '</td><td>' + fmt3(row.avg) + '</td><td>' + fmt3(row.ops) + '</td></tr>';
        }).join('');
        var teamAvg = totals.ab > 0 ? totals.h / totals.ab : 0;
        body += '<tr class="totals-row"><th scope="row">Totals</th><td>' + totals.ab + '</td><td>' + totals.r + '</td><td>' + totals.h + '</td><td>' + totals.rbi + '</td><td>' + totals.bb + '</td><td>' + totals.so + '</td><td>' + fmt3(teamAvg) + '</td><td></td></tr>';
        return body;
    }
    function pitcherTableRows(rows, isWinner) {
        var decisions = pitcherDecisions(rows, isWinner);
        var totals = { h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, outs: 0 };
        var body = rows.map(function (row, index) {
            totals.h += row.h; totals.r += row.r; totals.er += row.er; totals.bb += row.bb; totals.so += row.so; totals.hr += row.hr; totals.outs += Number(row.outs || 0);
            var name = row.name + (decisions[index] ? ' (' + decisions[index] + ')' : '');
            return '<tr><th scope="row">' + escapeHtml(name) + '</th><td>' + escapeHtml(row.ip) + '</td><td>' + row.h + '</td><td>' + row.r + '</td><td>' + row.er + '</td><td>' + row.bb + '</td><td>' + row.so + '</td><td>' + row.hr + '</td><td>' + gameEra(row) + '</td></tr>';
        }).join('');
        body += '<tr class="totals-row"><th scope="row">Totals</th><td>' + outsToIp(totals.outs) + '</td><td>' + totals.h + '</td><td>' + totals.r + '</td><td>' + totals.er + '</td><td>' + totals.bb + '</td><td>' + totals.so + '</td><td>' + totals.hr + '</td><td></td></tr>';
        return body;
    }
    function battingFieldingDetails(result) {
        function detail(label, line) {
            var s = line.summaryStats || {};
            return '<p><strong>' + escapeHtml(label) + '</strong> 2B: ' + (s.doubles || 0) + '; 3B: ' + (s.triples || 0) + '; HR: ' + (s.homeRuns || 0) + '; TB: ' + (s.totalBases || 0) + '; RBI: ' + (s.rbi || 0) + '; 2-out RBI: ' + (s.twoOutRbi || 0) + '; Runners left in scoring position, 2 out: ' + (s.lispLeft2Out || 0) + '; GIDP: ' + (s.gidp || 0) + '; Team RISP: ' + (s.rispText || '0-for-0') + '; Team LOB: ' + (s.leftOnBase || 0) + '; SB: ' + (s.stolenBases || 0) + '; CS: ' + (s.caughtStealing || 0) + '; Pickoffs: ' + (s.pickoffs || 0) + '; E: ' + (s.errors || 0) + '; Outfield assists: ' + (s.outfieldAssists || 0) + '; DP: ' + (s.dp || 0) + '</p>';
        }
        return '<section class="batting-fielding-details"><h5>Batting, Baserunning &amp; Fielding</h5>' +
            detail(result.away.abbreviation, result.boxScore.away) +
            detail(result.home.abbreviation, result.boxScore.home) + '</section>';
    }
    function pitcherNoteLine(rows) {
        return (rows || []).filter(function (row) { return row && row.name; }).map(function (row) {
            var outs = Number(row.outs || 0);
            var pitches = clamp(Math.round(outs * 4.1 + Number(row.h || 0) * 4.6 + Number(row.bb || 0) * 5.2 + Number(row.so || 0) * 1.8), 8, 130);
            var strikes = clamp(Math.round(pitches * clamp(0.61 + Number(row.so || 0) * 0.008 - Number(row.bb || 0) * 0.018, 0.52, 0.71)), 4, pitches);
            return row.name + ' ' + pitches + '-' + strikes;
        }).join('; ');
    }
    function teamGroundFly(line, players) {
        var outs = sum((players && players.pitchers || []).map(function (row) { return row.outs; }));
        if (!outs) outs = 27;
        var strikeouts = sum((players && players.pitchers || []).map(function (row) { return row.so; }));
        var ballsInPlayOuts = Math.max(0, outs - strikeouts);
        var groundouts = clamp(Math.round(ballsInPlayOuts * (0.52 + (Number(line.errors || 0) * 0.02))), 0, ballsInPlayOuts);
        var flyouts = Math.max(0, ballsInPlayOuts - groundouts);
        return groundouts + '-' + flyouts;
    }
    function battersFaced(players) {
        return sum((players && players.pitchers || []).map(function (row) {
            return Number(row.outs || 0) + Number(row.h || 0) + Number(row.bb || 0);
        }));
    }
    function inheritedRunnersLine(players) {
        var rows = (players && players.pitchers || []).slice(1);
        if (!rows.length) return null;
        var inherited = rows.reduce(function (total, row) {
            return total + clamp(Math.round((Number(row.r || 0) + Number(row.h || 0) + Number(row.bb || 0)) * 0.28), 0, 3);
        }, 0);
        var scored = inherited ? clamp(Math.round(sum(rows.map(function (row) { return row.r; })) * 0.22), 0, inherited) : 0;
        return inherited + '-' + scored;
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
        rows.push(['Groundouts-flyouts', result.away.abbreviation + ' ' + teamGroundFly(box.home, homePlayers) + '; ' + result.home.abbreviation + ' ' + teamGroundFly(box.away, awayPlayers)]);
        rows.push(['Batters faced', result.away.abbreviation + ' ' + battersFaced(awayPlayers) + '; ' + result.home.abbreviation + ' ' + battersFaced(homePlayers)]);
        var awayInherited = inheritedRunnersLine(awayPlayers);
        var homeInherited = inheritedRunnersLine(homePlayers);
        if (awayInherited || homeInherited) rows.push(['Inherited runners-scored', result.away.abbreviation + ' ' + (awayInherited || '0-0') + '; ' + result.home.abbreviation + ' ' + (homeInherited || '0-0')]);
        return '<section class="pitching-game-notes"><h4>Pitching &amp; Game Notes</h4>' + rows.map(function (row) {
            return '<p><strong>' + escapeHtml(row[0]) + ':</strong> ' + escapeHtml(row[1]) + '</p>';
        }).join('') + '</section>';
    }
    function lineupStatusChip(players) {
        var info = players && players.lineupStatus;
        if (!info || !info.badge) return '';
        var tone = info.status === 'confirmed' ? 'confirmed' : (info.status === 'posted' ? 'posted' : (info.status === 'historical' ? 'historical' : 'fallback'));
        return '<span class="lineup-status-chip" data-lineup-status="' + escapeAttr(tone) + '">' + escapeHtml(info.badge) + '</span>';
    }
    function battingTableSection(team, players) {
        var source = players && players.rosterSource ? players.rosterSource : 'Roster temporarily unavailable';
        var hasBatters = players && players.batters && players.batters.length;
        var headerLabel = '<div class="team-box-header"><p class="team-box-label">' + escapeHtml(team.name) + ' (' + escapeHtml(team.abbreviation) + ') Batting</p>' + lineupStatusChip(players) + '</div>';
        if (!hasBatters) {
            return '<section class="player-team-box">' + headerLabel + '<p class="player-source-note">Roster source: ' + escapeHtml(source) + '.</p><div class="sim-empty">Lineup unavailable. Verified roster data could not be loaded.</div></section>';
        }
        return '<section class="player-team-box">' + headerLabel + '<p class="player-source-note">Lineup source: ' + escapeHtml(source) + '.</p>' +
            '<div class="player-table-wrap"><table class="player-box-table"><thead><tr><th>Batter</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>SO</th><th>AVG</th><th>OPS</th></tr></thead><tbody>' + batterTableRows(players.batters) + '</tbody></table></div></section>';
    }
    function pitchingTableSection(team, players, isWinner) {
        var hasPitchers = players && players.pitchers && players.pitchers.length;
        if (!hasPitchers) {
            return '<section class="player-team-box"><p class="team-box-label">' + escapeHtml(team.name) + ' Pitching</p><div class="sim-empty">Pitching lines unavailable.</div></section>';
        }
        return '<section class="player-team-box"><p class="team-box-label">' + escapeHtml(team.name) + ' Pitching</p>' +
            '<div class="player-table-wrap"><table class="player-box-table"><thead><tr><th>Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>SO</th><th>HR</th><th>ERA</th></tr></thead><tbody>' + pitcherTableRows(players.pitchers, isWinner) + '</tbody></table></div></section>';
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
        panel.setAttribute('data-player-box-state', 'projected');
        content.innerHTML = '<p class="player-source-note box-score-disclaimer">Simulation output from TrustMyRecord. Player stat lines are modeled from the selected matchup and are not official MLB stats.</p>' +
            '<h4>Batting</h4>' +
            battingTableSection(result.away, box.players.away) +
            battingTableSection(result.home, box.players.home) +
            battingFieldingDetails(result) +
            '<h4>Pitching</h4>' +
            pitchingTableSection(result.away, box.players.away, awayWon) +
            pitchingTableSection(result.home, box.players.home, !awayWon) +
            pitchingGameNotes(result);
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
                '<div><strong>' + escapeHtml(line.team.abbreviation) + '</strong>' +
                '<span>' + escapeHtml(line.team.name) + '</span>' +
                '<small>' + line.hits + ' H / ' + line.errors + ' E</small></div></div>';
        }
        card.innerHTML = '<div class="box-score-status">FINAL</div>' +
            '<div class="box-score-matchup-main">' +
            teamCard('away', box.away, box.away.runs > box.home.runs) +
            '<div class="box-score-final"><strong>' + box.away.runs + '</strong><em>-</em><strong>' + box.home.runs + '</strong><span>FINAL</span></div>' +
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
        lines.push('Team        1 2 3 4 5 6 7 8 9 | R H E');
        [box.away, box.home].forEach(function (line) {
            lines.push((line.team.abbreviation + '          ').slice(0, 10) + line.innings.join(' ') + ' | ' + line.runs + ' ' + line.hits + ' ' + line.errors);
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
            lines.push(line.team.abbreviation + ': 2B ' + (s.doubles || 0) + ', 3B ' + (s.triples || 0) + ', HR ' + (s.homeRuns || 0) + ', TB ' + (s.totalBases || 0) + ', RBI ' + (s.rbi || 0) + ', BB ' + (s.walks || 0) + ', SO ' + (s.strikeouts || 0) + ', SB ' + (s.stolenBases || 0) + ', CS ' + (s.caughtStealing || 0) + ', LOB ' + (s.leftOnBase || 0) + ', Pitches ' + (s.totalPitches || 0) + '-' + (s.totalStrikes || 0));
        });
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
            body.innerHTML = '<tr><td colspan="13">Run a simulation to generate a box score.</td></tr>';
            if (summary) summary.textContent = 'Run a simulation to generate a box score.';
            setExportButtons(false);
            renderBoxScoreMatchupCard(null);
            renderPlayerBoxScore(null);
            return;
        }
        var box = result.boxScore;
        panel.setAttribute('data-box-score-state', 'projected');
        renderBoxScoreMatchupCard(result);
        title.textContent = result.away.name + ' at ' + result.home.name + ' / Final ' + result.away.abbreviation + ' ' + box.away.runs + ', ' + result.home.abbreviation + ' ' + box.home.runs;
        body.innerHTML = boxRow(box.away, box.winner.id) + boxRow(box.home, box.winner.id);
        if (summary) summary.innerHTML = '<strong>' + escapeHtml(box.summary) + '</strong><span>' + escapeHtml(box.pitcherLines.join(' / ')) + '</span><span>' + escapeHtml(box.keyPerformers.join(' / ')) + '</span>';
        renderPlayerBoxScore(result);
        setExportButtons(true);
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
            fetchBackendProjectionStatus(state.activeLiveContext)
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
                    teamRosters: state.liveContext.teamRosters || {},
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
        teamRosterUrl: teamRosterUrl
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
