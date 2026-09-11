import { Router, Request, Response } from 'express';
import { db } from '@workspace/db';
import { SQL, and, eq, sql, count, desc, avg, max, min } from 'drizzle-orm';
import { meetups, meetupParticipants, meetHistory, users, userTraits, traits, friends } from '@workspace/db';

// Create router
const router = Router();

// Helper to determine if user is authenticated
function isAuthenticated(req: any) {
  return req.session && req.session.userId;
}

// Helper to calculate distance between coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// GET /api/leaderboards/hosts - Top users who've created the most meetups
router.get('/hosts', async (req: Request, res: Response) => {
  try {
    // Use a very high limit when limit=0 is passed (for infinite scrolling)
    const requestedLimit = Number(req.query.limit);
    const limit = requestedLimit === 0 ? 100 : (requestedLimit || 10);
    const page = Number(req.query.page) || 1;
    const period = req.query.period || 'all';
    const latitude = req.query.latitude ? parseFloat(String(req.query.latitude)) : null;
    const longitude = req.query.longitude ? parseFloat(String(req.query.longitude)) : null;
    const radiusMiles = req.query.radius ? parseFloat(String(req.query.radius)) : 25;
    const zipCode = req.query.zipCode ? String(req.query.zipCode) : null;
    const friendsOnly = req.query.friends_only === 'true';
    
    console.log(`Leaderboards/hosts request params: lat=${latitude}, lon=${longitude}, radius=${radiusMiles}, zipCode=${zipCode}, period=${period}`);

    let timeConstraint: SQL<unknown> | undefined;
    
    // Add time period filter
    if (period === 'week') {
      timeConstraint = sql`${meetups.createdAt} > NOW() - INTERVAL '7 days'`;
    } else if (period === 'month') {
      timeConstraint = sql`${meetups.createdAt} > NOW() - INTERVAL '30 days'`;
    }
    
    // Base query to count meetups by creator, including all users
    let query = db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
        count: count(meetups.id).as('meetup_count'),
        // We don't need to include these in the groupBy - they cause duplicates
        // when a creator has multiple meetups with different locations
      })
      .from(users)
      .leftJoin(meetups, eq(users.id, meetups.creator_id))
      .groupBy(users.id, users.username, users.displayName, users.profilePicture)
      .orderBy(desc(sql`meetup_count`))
      .limit(limit * 3); // Get more results for filtering by location
      
    // Add time constraint if specified
    if (timeConstraint) {
      query = db
        .select({
          userId: users.id,
          username: users.username,
          displayName: users.displayName,
          profilePicture: users.profilePicture,
          count: count(meetups.id).as('meetup_count'),
        })
        .from(users)
        .leftJoin(meetups, eq(users.id, meetups.creator_id))
        // Only include meetups that match the time constraint
        .where(eq(meetups.creator_id, users.id)) // Join condition
        .where(timeConstraint) // Apply time filter
        .groupBy(users.id, users.username, users.displayName, users.profilePicture)
        .orderBy(desc(sql`meetup_count`))
        .limit(limit * 3);
    }
    
    let results = await query;
    
    console.log(`Top hosts raw query results: ${results.length} hosts found`);
    
    // Filter null creators and ensure we have valid data
    results = results.filter(result => 
      result.userId !== null && 
      result.username !== null
    );
    
    console.log(`After filtering invalid entries: ${results.length} hosts`);
    
    // Filter by location if coordinates provided
    if (latitude !== null && longitude !== null) {
      console.log(`Using location filtering with coordinates: ${latitude}, ${longitude}, radius: ${radiusMiles} miles`);
      
      // Get user location data for this query - using meetup locations with meetup IDs
      const userLocationData = await db
        .select({
          userId: meetups.creator_id,
          meetupId: meetups.id,
          latitude: meetups.latitude,
          longitude: meetups.longitude,
        })
        .from(meetups)
        .where(sql`${meetups.latitude} IS NOT NULL AND ${meetups.longitude} IS NOT NULL`);
      
      // Create a map for quick lookup - for each creator ID, store an array of their meetup locations with meetupIds
      const userLocationMap = new Map<number, Array<{meetupId: number, latitude: number, longitude: number}>>();
      userLocationData.forEach(record => {
        if (record.userId && record.latitude && record.longitude) {
          if (!userLocationMap.has(record.userId)) {
            userLocationMap.set(record.userId, []);
          }
          userLocationMap.get(record.userId)?.push({
            meetupId: record.meetupId,
            latitude: record.latitude,
            longitude: record.longitude
          });
        }
      });
      
      // Count only meetups within the radius for each host
      const userLocalMeetupCounts = new Map<number, number>();
      
      // Log for debugging
      console.log(`Processing host location data for ${userLocationMap.size} hosts`);
      
      // Manually iterate since TypeScript is having issues with Map.entries()
      userLocationMap.forEach((locations, userId) => {
        // Filter the locations to only include those within radius
        const localMeetups = locations.filter((loc: {meetupId: number, latitude: number, longitude: number}) => {
          const distance = calculateDistance(
            latitude!,
            longitude!,
            loc.latitude,
            loc.longitude
          );
          return distance <= radiusMiles;
        });
        
        // Count the number of unique meetups in the area
        const uniqueLocalMeetupIds = new Set(localMeetups.map((loc: {meetupId: number}) => loc.meetupId));
        const localCount = uniqueLocalMeetupIds.size;
        userLocalMeetupCounts.set(userId, localCount);
        
        // Debug log for each host
        console.log(`Host ${userId} has ${localCount} local meetups (out of ${locations.length} total)`, 
          localCount > 0 ? `Local meetups: ${Array.from(uniqueLocalMeetupIds).join(', ')}` : '');
      });
      
      // Create new results array with updated counts
      const filteredResults = [];
      
      for (const result of results) {
        const localCount = userLocalMeetupCounts.get(result.userId);
        if (localCount && localCount > 0) {
          // Make a copy of the result with the updated count
          filteredResults.push({
            userId: result.userId,
            username: result.username,
            displayName: result.displayName,
            profilePicture: result.profilePicture,
            count: localCount  // Use the localCount for this host
          });
        }
      }
      
      console.log(`After location filtering: ${filteredResults.length} hosts within ${radiusMiles} miles of coordinates ${latitude}, ${longitude}`);
      
      // Re-sort by the new local counts
      filteredResults.sort((a, b) => b.count - a.count);
      
      results = filteredResults;
    }
    
    // Only apply limit if specifically requested (for pagination)
    // If limit was 0, keep all results for infinite scrolling
    if (requestedLimit !== 0) {
      results = results.slice(0, limit);
    }
    
    console.log(`Final top hosts results: ${results.length} hosts`);
    
    // Filter by friends only if requested and user is authenticated
    if (friendsOnly && isAuthenticated(req)) {
      console.log(`Applying friends-only filter for user ID: ${req.session.userId}`);
      
      // Get the current user's friends
      const userFriends = await db
        .select({
          friendId: friends.friend_id
        })
        .from(friends)
        .where(eq(friends.user_id, req.session.userId));
      
      const friendIds = userFriends.map(f => f.friendId);
      
      // Add the user themselves to the list (so they see themselves in results)
      friendIds.push(req.session.userId);
      
      // Filter results to only include friends
      results = results.filter(user => friendIds.includes(user.userId));
      
      console.log(`After friends-only filtering: ${results.length} hosts`);
    }
    
    return res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching top hosts:', error);
    return res.status(500).json({ message: 'Failed to fetch leaderboard data' });
  }
});

// GET /api/leaderboards/active - Most active users (joining most meetups)
router.get('/active', async (req: Request, res: Response) => {
  try {
    // Use a very high limit when limit=0 is passed (for infinite scrolling)
    const requestedLimit = Number(req.query.limit);
    const limit = requestedLimit === 0 ? 100 : (requestedLimit || 10);
    const page = Number(req.query.page) || 1;
    const period = req.query.period || 'all';
    const latitude = req.query.latitude ? parseFloat(String(req.query.latitude)) : null;
    const longitude = req.query.longitude ? parseFloat(String(req.query.longitude)) : null;
    const radiusMiles = req.query.radius ? parseFloat(String(req.query.radius)) : 25;
    const zipCode = req.query.zipCode ? String(req.query.zipCode) : null;
    const friendsOnly = req.query.friends_only === 'true';

    let timeConstraint: SQL<unknown> | undefined;
    
    // Add time period filter
    if (period === 'week') {
      timeConstraint = sql`${meetHistory.joined_at} > NOW() - INTERVAL '7 days'`;
    } else if (period === 'month') {
      timeConstraint = sql`${meetHistory.joined_at} > NOW() - INTERVAL '30 days'`;
    }
    
    // Base query for all users, showing their activity level
    // This approach starts with all users, then left joins meet history
    // to ensure everyone appears even with zero activity
    let query = db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
        count: count(meetHistory.id).as('join_count'),
        // Location info is removed from the groupBy to prevent duplicates
      })
      .from(users)
      .leftJoin(meetHistory, eq(users.id, meetHistory.user_id))
      .leftJoin(meetups, eq(meetHistory.meetup_id, meetups.id))
      .groupBy(users.id, users.username, users.displayName, users.profilePicture);
    
    // Add time constraint if specified
    if (timeConstraint) {
      query = db
        .select({
          userId: users.id,
          username: users.username,
          displayName: users.displayName,
          profilePicture: users.profilePicture,
          count: count(meetHistory.id).as('join_count'),
        })
        .from(users)
        .leftJoin(meetHistory, eq(users.id, meetHistory.user_id))
        .leftJoin(meetups, eq(meetHistory.meetup_id, meetups.id))
        // Filter the join conditionally 
        .where(
          and(
            eq(meetHistory.user_id, users.id), // Join condition
            timeConstraint // Time constraint
          )
        )
        .groupBy(users.id, users.username, users.displayName, users.profilePicture);
    }
    
    // Execute the query and add order/limit
    let results = await query
      .orderBy(desc(sql`join_count`))
      .limit(limit * 3);
    
    console.log(`Most active users raw query results: ${results.length} users found`);
    
    // Filter null users
    results = results.filter(result => 
      result.userId !== null && 
      result.username !== null
    );
    
    console.log(`After filtering invalid entries: ${results.length} active users`);
    
    // Filter by location if coordinates provided
    if (latitude !== null && longitude !== null) {
      console.log(`Using location filtering with coordinates: ${latitude}, ${longitude}, radius: ${radiusMiles} miles`);
      
      // Get user location data for this query - using meetup locations from participation
      const userLocationData = await db
        .select({
          userId: meetHistory.user_id,
          meetupId: meetups.id,
          latitude: meetups.latitude,
          longitude: meetups.longitude,
        })
        .from(meetHistory)
        .innerJoin(meetups, eq(meetHistory.meetup_id, meetups.id))
        .where(sql`${meetups.latitude} IS NOT NULL AND ${meetups.longitude} IS NOT NULL`);
      
      // Create a map for quick lookup - for each user ID, store an array of their meetup locations with meetupIds
      const userLocationMap = new Map<number, Array<{meetupId: number, latitude: number, longitude: number}>>();
      userLocationData.forEach(record => {
        if (record.userId && record.latitude && record.longitude) {
          if (!userLocationMap.has(record.userId)) {
            userLocationMap.set(record.userId, []);
          }
          userLocationMap.get(record.userId)?.push({
            meetupId: record.meetupId,
            latitude: record.latitude,
            longitude: record.longitude
          });
        }
      });
      
      // Count only meetups within the radius for each user
      const userLocalMeetupCounts = new Map<number, number>();
      
      // Log for debugging
      console.log(`Processing location data for ${userLocationMap.size} users`);
      
      // Manually iterate since TypeScript is having issues with Map.entries()
      userLocationMap.forEach((locations, userId) => {
        // Filter the locations to only include those within radius
        const localMeetups = locations.filter((loc: {meetupId: number, latitude: number, longitude: number}) => {
          const distance = calculateDistance(
            latitude!,
            longitude!,
            loc.latitude,
            loc.longitude
          );
          return distance <= radiusMiles;
        });
        
        // Count the number of unique meetups in the area
        const uniqueLocalMeetupIds = new Set(localMeetups.map((loc: {meetupId: number}) => loc.meetupId));
        const localCount = uniqueLocalMeetupIds.size;
        userLocalMeetupCounts.set(userId, localCount);
        
        // Debug log for each user
        console.log(`User ${userId} has ${localCount} local meetups (out of ${locations.length} total)`, 
          localCount > 0 ? `Local meetups: ${Array.from(uniqueLocalMeetupIds).join(', ')}` : '');
      });
      
      // Create new results array with updated counts
      const filteredResults = [];
      
      for (const result of results) {
        const localCount = userLocalMeetupCounts.get(result.userId);
        if (localCount && localCount > 0) {
          // Make a copy of the result with the updated count
          filteredResults.push({
            userId: result.userId,
            username: result.username,
            displayName: result.displayName,
            profilePicture: result.profilePicture,
            count: localCount
          });
        }
      }
      
      console.log(`After location filtering: ${filteredResults.length} active users within ${radiusMiles} miles of coordinates ${latitude}, ${longitude}`);
      
      // Re-sort by the new local counts
      filteredResults.sort((a, b) => b.count - a.count);
      
      results = filteredResults;
    }
    
    // No hard limit, return all results
    // Only apply limit if specifically requested (for pagination)
    if (requestedLimit !== 0) {
      results = results.slice(0, limit);
    }
    
    console.log(`Final most active users results: ${results.length} users`);
    
    // Filter by friends only if requested and user is authenticated
    if (friendsOnly && isAuthenticated(req)) {
      console.log(`Applying friends-only filter for user ID: ${req.session.userId}`);
      
      const userId = req.session.userId;
      
      // Get the current user's friends
      const userFriends = await db
        .select({
          friendId: friends.friend_id
        })
        .from(friends)
        .where(eq(friends.user_id, userId));
      
      const friendIds = userFriends.map(f => f.friendId);
      
      // Add the user themselves to the list (so they see themselves in results)
      friendIds.push(userId);
      
      // Filter results to only include friends
      results = results.filter(user => friendIds.includes(user.userId));
      
      console.log(`After friends-only filtering: ${results.length} users`);
    }
    
    return res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching most active users:', error);
    return res.status(500).json({ message: 'Failed to fetch leaderboard data' });
  }
});

// GET /api/leaderboards/rated - Highest rated users
router.get('/rated', async (req: Request, res: Response) => {
  try {
    // Use a very high limit when limit=0 is passed (for infinite scrolling)
    const requestedLimit = Number(req.query.limit);
    const limit = requestedLimit === 0 ? 1000 : (requestedLimit || 10); // Increased to 1000 for "worldwide" view
    const page = Number(req.query.page) || 1;
    const period = req.query.period || 'all';
    const latitude = req.query.latitude ? parseFloat(String(req.query.latitude)) : null;
    const longitude = req.query.longitude ? parseFloat(String(req.query.longitude)) : null;
    const radiusMiles = req.query.radius ? parseFloat(String(req.query.radius)) : 25;
    const isWorldwide = req.query.worldwide === 'true';

    // Build time constraint for SQL
    let timeCondition = '';
    if (period === 'week') {
      timeCondition = 'AND ut.created_at > NOW() - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      timeCondition = 'AND ut.created_at > NOW() - INTERVAL \'30 days\'';
    }
    
    // If worldwide view is requested, we need to fetch a lot more data
    const queryLimit = isWorldwide ? 1000 : limit * 3;
    
    // Use raw SQL for the main query to count NET endorsements (not total)
    // Improved to better capture location data from all user meetup participations
    const ratedUsersQueryString = `
      SELECT 
        u.id as "userId",
        u.username,
        u.display_name as "displayName",
        u.profile_picture as "profilePicture",
        COUNT(ut.id) as "totalRatings",
        SUM(ut.endorsement_count) as "endorsements",
        COUNT(DISTINCT ut.trait_id) as "distinctTraits",
        MAX(m.latitude) as latitude,
        MAX(m.longitude) as longitude,
        RANK() OVER (ORDER BY SUM(ut.endorsement_count) DESC) as trait_rank
      FROM 
        user_traits ut
      JOIN 
        users u ON ut.user_id = u.id
      JOIN 
        traits t ON ut.trait_id = t.id
      JOIN 
        meetups m ON ut.meetup_id = m.id
      WHERE TRUE ${timeCondition}
      GROUP BY 
        u.id, u.username, u.display_name, u.profile_picture
      HAVING 
        SUM(ut.endorsement_count) > 0
      ORDER BY 
        SUM(ut.endorsement_count) DESC
      LIMIT ${queryLimit}
    `;
    
    console.log("Executing rated users query:", ratedUsersQueryString);
    console.log("Worldwide mode:", isWorldwide);
    
    // Execute the query using raw SQL
    const { rows: rawResults } = await db.execute(ratedUsersQueryString);
    
    // Make a proper array of results
    let results = [...rawResults];
    
    console.log(`Highest rated users raw query results: ${results.length} users found`);
    
    // Filter null users
    results = results.filter(result => 
      result.userId !== null && 
      result.username !== null
    );
    
    console.log(`After filtering invalid entries: ${results.length} rated users`);
    
    // Filter by location if coordinates provided and not worldwide
    if (latitude !== null && longitude !== null && !isWorldwide) {
      // Log specific info about Test9999 for debugging
      const test9999Entry = results.find(u => u.username === 'Test9999');
      if (test9999Entry) {
        console.log('DEBUG: Found Test9999 before filtering:', {
          id: test9999Entry.userId,
          username: test9999Entry.username,
          displayName: test9999Entry.displayName,
          latitude: test9999Entry.latitude,
          longitude: test9999Entry.longitude,
          hasLocation: Boolean(test9999Entry.latitude && test9999Entry.longitude),
          endorsements: test9999Entry.endorsements,
          totalRatings: test9999Entry.totalRatings
        });
      } else {
        console.log('DEBUG: Test9999 not found in results before location filtering');
      }

      results = results.filter(result => {
        // Extra logging for Test9999
        if (result.username === 'Test9999') {
          const hasLocation = Boolean(result.latitude && result.longitude);
          if (!hasLocation) {
            console.log('DEBUG: Test9999 has no location data');
            return false;
          }
          
          const distance = calculateDistance(
            latitude,
            longitude,
            Number(result.latitude),
            Number(result.longitude)
          );
          
          console.log(`DEBUG: Test9999 distance from ${latitude},${longitude} to ${result.latitude},${result.longitude} is ${distance} miles (max: ${radiusMiles})`);
          return distance <= radiusMiles;
        }
        
        // Skip entries without location data
        if (!result.latitude || !result.longitude) return false;
        
        const distance = calculateDistance(
          latitude, 
          longitude, 
          Number(result.latitude), 
          Number(result.longitude)
        );
        
        return distance <= radiusMiles;
      });
      
      console.log(`After location filtering: ${results.length} rated users within ${radiusMiles} miles`);
      
      // Check if Test9999 is still in results
      const test9999AfterFilter = results.find(u => u.username === 'Test9999');
      if (test9999AfterFilter) {
        console.log('DEBUG: Test9999 survived location filtering');
      } else {
        console.log('DEBUG: Test9999 was removed by location filtering');
      }
    }
    
    // Only apply limit if specifically requested (for pagination)
    // If limit was 0 or worldwide mode, keep more results for infinite scrolling
    if (requestedLimit !== 0 && !isWorldwide) {
      results = results.slice(0, limit);
    } else if (isWorldwide) {
      // For worldwide view, we keep more results (but still limit to avoid performance issues)
      results = results.slice(0, 1000); 
    }
    
    // Now for each user, fetch their highest-rated trait
    const enhancedResults = await Promise.all(
      results.map(async (user) => {
        // Skip users with no endorsements
        if (!user.endorsements || user.endorsements === 0) {
          return { ...user, topTrait: null };
        }
        
        // Get the user's top trait with a direct SQL query showing NET endorsements and total ratings
        const topTraitQueryString = `
          SELECT 
            t.id as "traitId",
            t.name as "traitName",
            t.category as "traitCategory",
            COUNT(ut.id) as "totalRatings",
            SUM(ut.endorsement_count) as "endorsements",
            COUNT(DISTINCT ut.endorser_id) as "uniqueEndorsers",
            COUNT(DISTINCT ut.trait_id) as "totalDistinctTraits"
          FROM traits t
          JOIN user_traits ut ON t.id = ut.trait_id
          WHERE ut.user_id = ${user.userId}
          GROUP BY t.id, t.name, t.category
          ORDER BY SUM(ut.endorsement_count) DESC, COUNT(ut.id) DESC
          LIMIT 1
        `;
        
        const { rows: topTraitsRows } = await db.execute(topTraitQueryString);
        
        return { 
          ...user, 
          topTrait: topTraitsRows.length > 0 ? topTraitsRows[0] : null 
        };
      })
    );
    
    console.log(`Final highest rated users results: ${enhancedResults.length} users`);
    
    return res.status(200).json(enhancedResults);
  } catch (error) {
    console.error('Error fetching highest rated users:', error);
    return res.status(500).json({ message: 'Failed to fetch leaderboard data' });
  }
});

// GET /api/leaderboards/traits-by-user - Individual traits with highest rating per user
router.get('/traits-by-user', async (req: Request, res: Response) => {
  try {
    // Use a very high limit when limit=0 is passed (for infinite scrolling)
    const requestedLimit = Number(req.query.limit);
    const limit = requestedLimit === 0 ? 1000 : (requestedLimit || 50); // Increased for detailed view
    const period = req.query.period || 'all';
    const traitCategory = req.query.category || null;
    const latitude = req.query.latitude ? parseFloat(String(req.query.latitude)) : null;
    const longitude = req.query.longitude ? parseFloat(String(req.query.longitude)) : null;
    const radiusMiles = req.query.radius ? parseFloat(String(req.query.radius)) : 25;
    const isWorldwide = req.query.worldwide === 'true';
    const searchQuery = req.query.q ? String(req.query.q) : null;
    
    // Special case for user search - if specifically looking for a user, return their traits regardless of location
    const isUserSearch = searchQuery && searchQuery.toLowerCase().includes('test9999');

    console.log("\n=== TRAITS BY USER QUERY DETAILS ===");
    console.log("Input parameters:", {
      requestedLimit,
      limit,
      period,
      traitCategory,
      latitude,
      longitude,
      radiusMiles,
      isWorldwide,
      queryUrl: req.url
    });

    // Build time constraint for SQL
    let timeCondition = '';
    if (period === 'week') {
      timeCondition = 'AND ut.created_at > NOW() - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      timeCondition = 'AND ut.created_at > NOW() - INTERVAL \'30 days\'';
    }
    
    // Build category constraint for SQL
    let categoryCondition = '';
    if (traitCategory) {
      categoryCondition = `AND t.category = '${String(traitCategory)}'`;
    }
    
    // If worldwide view is requested, we need to fetch a lot more data
    const queryLimit = isWorldwide ? 1000 : limit * 3;
    
    // Build a new improved SQL query that properly respects location boundaries
    // First build Common Table Expressions (CTEs) to filter by location first
    const traitsByUserQueryString = `
      WITH location_filtered_meetups AS (
        -- First, collect all meetup locations that are within the specified radius
        -- Only do this filtering when latitude/longitude are provided
        SELECT 
          m.id as meetup_id,
          m.latitude as latitude,
          m.longitude as longitude
        FROM 
          meetups m
        WHERE 
          m.latitude IS NOT NULL 
          AND m.longitude IS NOT NULL
          ${(!isWorldwide && latitude !== null && longitude !== null) ? 
            `AND (
              -- Using the Haversine formula directly in SQL for accuracy
              (3959 * acos(
                cos(radians(${latitude})) * cos(radians(m.latitude)) * 
                cos(radians(m.longitude) - radians(${longitude})) + 
                sin(radians(${latitude})) * sin(radians(m.latitude))
              )) <= ${radiusMiles}
            )` : ''}
      ),
      
      -- Get each individual trait vote with its location
      trait_votes AS (
        SELECT 
          ut.id,
          ut.user_id,
          ut.trait_id,
          ut.endorsement_count,
          ut.meetup_id,
          ut.created_at,
          m.latitude,
          m.longitude,
          m.title as meetup_title
        FROM 
          user_traits ut
        JOIN
          meetups m ON ut.meetup_id = m.id
        ${(!isWorldwide && latitude !== null && longitude !== null) ? 
          `JOIN 
             location_filtered_meetups lfm ON lfm.meetup_id = m.id` : ''
        }
        WHERE
          m.latitude IS NOT NULL AND m.longitude IS NOT NULL
          ${timeCondition}
      )
      
      -- Now perform the main query using trait votes by meetup location
      SELECT 
        u.id as "userId",
        u.username,
        u.display_name as "displayName",
        u.profile_picture as "profilePicture",
        t.id as "traitId",
        t.name as "traitName", 
        -- Use the search coordinates as the central reference point if provided
        ${(latitude && longitude) ? `${latitude} as "meetupLat",
        ${longitude} as "meetupLng",` :
        `-- Otherwise use first location from group
        MIN(tv.latitude) as "meetupLat",
        MIN(tv.longitude) as "meetupLng",`}
        -- Get meetup IDs for reference
        array_agg(DISTINCT tv.meetup_id) as "meetupIds",
        -- Sum votes grouped by user & trait, not by each individual meetup
        COUNT(tv.id) as "totalVotes",
        SUM(tv.endorsement_count) as "netRating",
        RANK() OVER (ORDER BY SUM(tv.endorsement_count) DESC) as "traitRank"
      FROM 
        trait_votes tv
      JOIN 
        users u ON tv.user_id = u.id
      JOIN 
        traits t ON tv.trait_id = t.id
      WHERE 
        1=1
        ${categoryCondition}
        ${searchQuery ? `AND u.username ILIKE '%${searchQuery}%'` : ''}
      GROUP BY 
        u.id, u.username, u.display_name, u.profile_picture, t.id, t.name
      HAVING 
        SUM(tv.endorsement_count) > 0
      ORDER BY 
        SUM(tv.endorsement_count) DESC, COUNT(tv.id) DESC, u.username
      LIMIT ${queryLimit}
    `;
    
    console.log("Executing traits-by-user query with params:", {
      radius: radiusMiles,
      latitude,
      longitude,
      worldwide: isWorldwide,
      period,
      timeFilter: timeCondition // Log the actual SQL time filter being applied
    });
    
    // Additional logging for time filtering
    if (period === 'week') {
      console.log('Applying 7-day time filter to traits-by-user query');
    } else if (period === 'month') {
      console.log('Applying 30-day time filter to traits-by-user query');
    } else {
      console.log('No time filter applied to traits-by-user query (all time period)');
    }
    
    // Execute the query using raw SQL
    const { rows: rawResults } = await db.execute(traitsByUserQueryString);
    
    // Make a proper array of results
    let results = [...rawResults];
    
    console.log(`Traits by user raw query results: ${results.length} trait ratings found`);
    
    // Filter null users or traits
    results = results.filter(result => 
      result.userId !== null && 
      result.username !== null &&
      result.traitId !== null
    );
    
    console.log(`After filtering invalid entries: ${results.length} trait ratings`);
    
    // Enhanced debugging - log ALL raw traits before filtering
    console.log(`DEBUG: ALL traits before filtering (${results.length} total):`, 
      results.slice(0, 5).map(r => ({ 
        username: r.username, 
        traitName: r.traitName, 
        meetupLat: r.meetupLat, 
        meetupLng: r.meetupLng,
        netRating: r.netRating
      }))
    );
    
    // Check for test9999's traits in raw results
    const test9999RawTraits = results.filter(r => r.username === "Test9999");
    console.log(`DEBUG: Found ${test9999RawTraits.length} raw traits for Test9999:`, 
      test9999RawTraits.map(r => ({ 
        traitName: r.traitName, 
        meetupLat: r.meetupLat, 
        meetupLng: r.meetupLng,
        netRating: r.netRating
      }))
    );
    
    // Apply specific search filtering if a username is being searched for
    const userSearch = req.query.q ? String(req.query.q).toLowerCase() : null;
    
    // Track if we're searching by username
    const isSearchingByUsername = userSearch && userSearch.length > 0;
    
    // Get specific meetup location data and meetup IDs for traits
    let meetupLocationMap = new Map<number, { lat: number, lng: number }>();
    let traitMeetupMap = new Map<string, number>(); // Maps userId_traitId to meetupId
    
    // If location filtering is being used, get precise meetup locations from the database
    if (latitude !== null && longitude !== null && !isWorldwide) {
      try {
        // Get all meetup locations for joins to resolve location inconsistencies
        const meetupLocations = await db.execute(`
          SELECT 
            id, 
            latitude, 
            longitude 
          FROM 
            meetups 
          WHERE 
            latitude IS NOT NULL AND longitude IS NOT NULL
        `);
        
        // Build a map of meetup locations for reference
        meetupLocations.rows.forEach((meetup: any) => {
          if (meetup.id && meetup.latitude && meetup.longitude) {
            meetupLocationMap.set(meetup.id, {
              lat: meetup.latitude,
              lng: meetup.longitude
            });
          }
        });
        
        console.log(`Loaded ${meetupLocationMap.size} meetup locations for precise filtering`);
        
        // Also get the meetup_id for each user trait rating
        // This helps resolve the location issue where trait locations might be incorrect
        const traitMeetups = await db.execute(`
          SELECT 
            user_id, 
            trait_id, 
            meetup_id
          FROM 
            user_traits
          WHERE 
            meetup_id IS NOT NULL
        `);
        
        // Build a map to lookup meetup_id by user_id and trait_id
        traitMeetups.rows.forEach((trait: any) => {
          if (trait.user_id && trait.trait_id && trait.meetup_id) {
            // Create a composite key for lookup
            const key = `${trait.user_id}_${trait.trait_id}`;
            traitMeetupMap.set(key, trait.meetup_id);
          }
        });
        
        console.log(`Loaded ${traitMeetupMap.size} trait-to-meetup mappings for location validation`);
        
      } catch (err) {
        console.error("Error loading meetup locations:", err);
      }
    }

    // Filter by location if coordinates provided and not worldwide
    if (latitude !== null && longitude !== null && !isWorldwide) {
      // Add enhanced logging for location filtering
      console.log(`DEBUG: Location filtering with radius ${radiusMiles} miles from ${latitude},${longitude}`);
      
      // TEST SPECIFIC COORDINATES FOR BOTH MEETUPS
      // Original meetup 702
      const testMeetupLat = 41.393908221444065;
      const testMeetupLng = -81.79167051874825;
      const testDistance = calculateDistance(latitude, longitude, testMeetupLat, testMeetupLng);
      console.log(`CRITICAL TEST: Distance from search point to meetup 702 (Test Location) is ${testDistance.toFixed(2)} miles`);
      console.log(`CRITICAL TEST: Is meetup 702 within ${radiusMiles} mile radius? ${testDistance <= radiusMiles}`);
      
      // Friendly trait location that's showing up with 25 miles but not 5 miles
      const friendlyTraitLat = 41.46985931651232;
      const friendlyTraitLng = -81.52315210791967;
      const friendlyDistance = calculateDistance(latitude, longitude, friendlyTraitLat, friendlyTraitLng);
      console.log(`CRITICAL TEST: Distance from search point to Friendly trait location is ${friendlyDistance.toFixed(2)} miles`);
      console.log(`CRITICAL TEST: Is Friendly trait within ${radiusMiles} mile radius? ${friendlyDistance <= radiusMiles}`);
      
      // Enhanced debugging - track which traits get filtered
      const filteredOut: Array<{username: string, traitName: string, distance: number, location: string}> = [];
      
      results = results.filter(result => {
        // If we're specifically searching for a user, prioritize showing their traits
        if (isSearchingByUsername && result.username && result.username.toLowerCase().includes(userSearch!)) {
          console.log(`DEBUG: Including trait ${result.traitName} for user ${result.username} due to specific user search`);
          return true;
        }
        
        // If we don't have location data for this trait, SKIP it when doing location filtering
        // This is critical for proper location-based filtering
        if (!result.meetupLat || !result.meetupLng) {
          console.log(`DEBUG: EXCLUDING trait without location data: ${result.username} - ${result.traitName}`);
          // Skip traits without location data when filtering by location
          return false;
        }
        
        // The SQL query is now correctly fetching the actual meetup locations 
        // so we don't need to correct the coordinates anymore.
        // Just use the coordinates that came from the filtered SQL query
        let meetupLat = Number(result.meetupLat);
        let meetupLng = Number(result.meetupLng);
        
        // Log which coordinates we're using (for debugging)
        if (result.username === "Test9999") {
          console.log(`Using original meetup coordinates for ${result.username}'s trait ${result.traitName}: ${meetupLat}, ${meetupLng}`);
        }
        
        const distance = calculateDistance(
          latitude, 
          longitude, 
          meetupLat,
          meetupLng
        );
        
        const isWithinRadius = distance <= radiusMiles;
        
        // Debug output for specific user
        if (result.username === "Test9999") {
          console.log(`DEBUG: Test9999 trait ${result.traitName} distance: ${distance} miles (from ${latitude},${longitude} to ${meetupLat},${meetupLng})`);
          console.log(`DEBUG: Includes trait? ${isWithinRadius}`);
          
          // Also log if we used corrected location data
          if (meetupLat !== Number(result.meetupLat) || meetupLng !== Number(result.meetupLng)) {
            console.log(`DEBUG: Used corrected location data for Test9999's ${result.traitName} trait:
              Original: ${result.meetupLat}, ${result.meetupLng}
              Corrected: ${meetupLat}, ${meetupLng}`);
          }
        }
        
        // Enhanced debugging - track filtered out traits
        if (!isWithinRadius) {
          filteredOut.push({
            username: String(result.username),
            traitName: String(result.traitName),
            distance: distance,
            location: `${result.meetupLat},${result.meetupLng}`
          });
        }
        
        return isWithinRadius;
      });
      
      console.log(`After location filtering: ${results.length} trait ratings within ${radiusMiles} miles of coordinates ${latitude}, ${longitude}`);
      console.log(`DEBUG: Filtered out ${filteredOut.length} traits due to distance constraints`, 
        filteredOut.slice(0, 10)
      );
    }
    
    // Check for specific users in results
    const test9999Traits = results.filter(row => row.username === "Test9999");
    if (test9999Traits.length > 0) {
      console.log(`Found ${test9999Traits.length} traits for Test9999:`, test9999Traits);
    } else {
      console.log("Test9999 user NOT found in traits-by-user results");
    }
    
    // Check for Creative Thinker trait specifically
    const creativeTraits = results.filter(row => row.traitName === "Creative Thinker");
    if (creativeTraits.length > 0) {
      console.log(`Found ${creativeTraits.length} Creative Thinker traits:`, creativeTraits);
    } else {
      console.log("Creative Thinker trait NOT found in traits-by-user results");
    }
    
    // Only apply limit if specifically requested (for pagination)
    if (requestedLimit !== 0) {
      results = results.slice(0, limit);
    }
    
    console.log(`Final traits by user results: ${results.length} ratings, first few:`, results.slice(0, 3));
    
    return res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching individual traits by user:', error);
    return res.status(500).json({ message: 'Failed to fetch leaderboard data' });
  }
});

// GET /api/leaderboards/traits - Users with most positive traits
router.get('/traits', async (req: Request, res: Response) => {
  try {
    // Use a very high limit when limit=0 is passed (for infinite scrolling)
    const requestedLimit = Number(req.query.limit);
    const limit = requestedLimit === 0 ? 1000 : (requestedLimit || 10); // Increased for worldwide view
    const page = Number(req.query.page) || 1;
    const period = req.query.period || 'all';
    const traitCategory = req.query.category || null;
    const latitude = req.query.latitude ? parseFloat(String(req.query.latitude)) : null;
    const longitude = req.query.longitude ? parseFloat(String(req.query.longitude)) : null;
    const radiusMiles = req.query.radius ? parseFloat(String(req.query.radius)) : 25;
    const isWorldwide = req.query.worldwide === 'true';

    // Build time constraint for SQL
    let timeCondition = '';
    if (period === 'week') {
      timeCondition = 'AND ut.created_at > NOW() - INTERVAL \'7 days\'';
    } else if (period === 'month') {
      timeCondition = 'AND ut.created_at > NOW() - INTERVAL \'30 days\'';
    }
    
    // Build category constraint for SQL
    let categoryCondition = '';
    if (traitCategory) {
      categoryCondition = `AND t.category = '${String(traitCategory)}'`;
    }
    
    // If worldwide view is requested, we need to fetch a lot more data
    const queryLimit = isWorldwide ? 1000 : limit * 3;
    
    // Build a raw SQL query to count unique traits per user
    // Improved to better capture location data from all user meetup participations
    const traitsQueryString = `
      WITH user_locations AS (
        -- Get all locations from meetups this user participated in
        SELECT 
          mp.user_id,
          m.latitude,
          m.longitude
        FROM meetup_participants mp
        JOIN meetups m ON mp.meetup_id = m.id
        WHERE m.latitude IS NOT NULL AND m.longitude IS NOT NULL
        UNION
        -- Also include meetups where the user received a trait rating 
        SELECT 
          ut.user_id,
          m.latitude,
          m.longitude
        FROM user_traits ut
        JOIN meetups m ON ut.meetup_id = m.id
        WHERE m.latitude IS NOT NULL AND m.longitude IS NOT NULL
      ),
      trait_counts AS (
        SELECT 
          u.id AS user_id,
          u.username,
          u.display_name,
          u.profile_picture,
          COUNT(DISTINCT ut.trait_id) AS trait_count_value,
          -- Get location data from the unified location source
          (SELECT latitude FROM user_locations WHERE user_id = u.id LIMIT 1) AS latitude,
          (SELECT longitude FROM user_locations WHERE user_id = u.id LIMIT 1) AS longitude
        FROM users u
        LEFT JOIN user_traits ut ON u.id = ut.user_id
        LEFT JOIN traits t ON t.id = ut.trait_id
        WHERE TRUE ${timeCondition} ${categoryCondition}
        GROUP BY u.id, u.username, u.display_name, u.profile_picture
        ORDER BY COUNT(DISTINCT ut.trait_id) DESC
        LIMIT ${queryLimit}
      )
      SELECT 
        user_id as "userId", 
        username, 
        display_name as "displayName",
        profile_picture as "profilePicture",
        CAST(trait_count_value AS INTEGER) as "traitCount",
        latitude,
        longitude
      FROM trait_counts
      ORDER BY trait_count_value DESC
    `;
    
    console.log("Executing traits query:", traitsQueryString);
    console.log("Worldwide mode:", isWorldwide);
    
    // Execute the query using raw SQL
    const { rows: rawResults } = await db.execute(traitsQueryString);
    
    // Make a proper array of results
    let results = [...rawResults];
    
    console.log(`Trait leaders raw query results: ${results.length} users found`);
    
    // Filter null users
    results = results.filter(result => 
      result.userId !== null && 
      result.username !== null
    );
    
    console.log(`After filtering invalid entries: ${results.length} trait leaders`);
    
    // Filter by location if coordinates provided and not worldwide
    if (latitude !== null && longitude !== null && !isWorldwide) {
      results = results.filter(result => {
        // Skip entries without location data
        if (!result.latitude || !result.longitude) return false;
        
        const distance = calculateDistance(
          latitude, 
          longitude, 
          Number(result.latitude), 
          Number(result.longitude)
        );
        
        return distance <= radiusMiles;
      });
      
      console.log(`After location filtering: ${results.length} trait leaders within ${radiusMiles} miles`);
    }
    
    // Only apply limit if specifically requested (for pagination)
    // If limit was 0 or worldwide mode, keep more results for infinite scrolling
    if (requestedLimit !== 0 && !isWorldwide) {
      results = results.slice(0, limit);
    } else if (isWorldwide) {
      // For worldwide view, we keep more results (but still limit to avoid performance issues)
      results = results.slice(0, 1000); 
    }
    
    console.log(`Final trait leaders results: ${results.length} users`);
    
    return res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching users with most traits:', error);
    return res.status(500).json({ message: 'Failed to fetch leaderboard data' });
  }
});

// GET /api/leaderboards/weekly-climbers - Biggest movers in rank this week
router.get('/weekly-climbers', async (req: Request, res: Response) => {
  try {
    // Use a very high limit when limit=0 is passed (for infinite scrolling)
    const requestedLimit = Number(req.query.limit);
    const limit = requestedLimit === 0 ? 1000 : (requestedLimit || 10); // Increased for worldwide view
    const page = Number(req.query.page) || 1;
    const latitude = req.query.latitude ? parseFloat(String(req.query.latitude)) : null;
    const longitude = req.query.longitude ? parseFloat(String(req.query.longitude)) : null;
    const radiusMiles = req.query.radius ? parseFloat(String(req.query.radius)) : 25;
    const isWorldwide = req.query.worldwide === 'true';
    
    console.log("Worldwide mode:", isWorldwide);
    
    // Get meetups and participation from last week - start from users table
    const lastWeekQuery = db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
        lastWeekCount: count(meetHistory.id).as('last_week_count'),
        // Use meetup location for proximity calculation with aggregate functions
        latitude: sql`MAX(${meetups.latitude})`.as('latitude'),
        longitude: sql`MAX(${meetups.longitude})`.as('longitude'),
      })
      .from(users)
      .leftJoin(meetHistory, eq(users.id, meetHistory.user_id))
      .leftJoin(meetups, eq(meetHistory.meetup_id, meetups.id))
      // Only include history from last week in the count
      .where(
        sql`${meetHistory.joined_at} BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'`
      )
      .groupBy(users.id, users.username, users.displayName, users.profilePicture);
    
    // Get meetups and participation from this week - include all users
    const thisWeekQuery = db
      .select({
        userId: users.id,
        thisWeekCount: count(meetHistory.id).as('this_week_count'),
      })
      .from(users)
      .leftJoin(meetHistory, eq(users.id, meetHistory.user_id))
      .where(
        and(
          eq(meetHistory.user_id, users.id),
          sql`${meetHistory.joined_at} > NOW() - INTERVAL '7 days'`
        )
      )
      .groupBy(users.id);
    
    // Execute queries
    const [lastWeekResults, thisWeekResults] = await Promise.all([
      lastWeekQuery,
      thisWeekQuery
    ]);
    
    console.log(`Weekly climbers raw query results: ${lastWeekResults.length} users from last week, ${thisWeekResults.length} users from this week`);
    
    // Filter out null users from last week's results
    const filteredLastWeekResults = lastWeekResults.filter(result => 
      result.userId !== null && 
      result.username !== null
    );
    
    console.log(`After filtering invalid entries from last week: ${filteredLastWeekResults.length} users`);
    
    // Combine results and calculate growth
    let combinedResults = filteredLastWeekResults.map(lastWeek => {
      const thisWeek = thisWeekResults.find(item => item.userId === lastWeek.userId);
      const thisWeekCount = thisWeek ? Number(thisWeek.thisWeekCount) : 0;
      const lastWeekCount = Number(lastWeek.lastWeekCount) || 1; // Avoid division by 0
      
      return {
        userId: lastWeek.userId,
        username: lastWeek.username,
        displayName: lastWeek.displayName,
        profilePicture: lastWeek.profilePicture,
        lastWeekCount: lastWeekCount,
        thisWeekCount: thisWeekCount,
        growth: thisWeekCount / lastWeekCount,
        growthPercent: ((thisWeekCount / lastWeekCount) - 1) * 100,
        latitude: lastWeek.latitude,
        longitude: lastWeek.longitude,
      };
    });
    
    // Add users who weren't active last week but are this week
    for (const thisWeek of thisWeekResults) {
      const exists = combinedResults.some(item => item.userId === thisWeek.userId);
      
      if (!exists) {
        const userData = await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            profilePicture: users.profilePicture,
          })
          .from(users)
          .where(eq(users.id, thisWeek.userId))
          .limit(1);
        
        if (userData.length > 0) {
          combinedResults.push({
            userId: thisWeek.userId,
            username: userData[0].username,
            displayName: userData[0].displayName,
            profilePicture: userData[0].profilePicture,
            lastWeekCount: 0,
            thisWeekCount: Number(thisWeek.thisWeekCount),
            growth: Number.POSITIVE_INFINITY, // Infinite growth (new user)
            growthPercent: 100, // 100% growth
            latitude: null,
            longitude: null,
          });
        }
      }
    }
    
    // Sort by growth
    combinedResults.sort((a, b) => b.growth - a.growth);
    
    console.log(`After combining growth data: ${combinedResults.length} climbers`);
    
    // Filter by location if coordinates provided and not worldwide
    if (latitude !== null && longitude !== null && !isWorldwide) {
      combinedResults = combinedResults.filter(result => {
        // Skip entries without location data
        if (!result.latitude || !result.longitude) return false;
        
        const distance = calculateDistance(
          latitude, 
          longitude, 
          result.latitude, 
          result.longitude
        );
        
        return distance <= radiusMiles;
      });
      
      console.log(`After location filtering: ${combinedResults.length} climbers within ${radiusMiles} miles`);
    }
    
    // Only apply limit if specifically requested (for pagination)
    // If limit was 0 or worldwide mode, keep more results for infinite scrolling
    if (requestedLimit !== 0 && !isWorldwide) {
      combinedResults = combinedResults.slice(0, limit);
    } else if (isWorldwide) {
      // For worldwide view, we keep more results (but still limit to avoid performance issues)
      combinedResults = combinedResults.slice(0, 1000); 
    }
    
    console.log(`Final weekly climbers results: ${combinedResults.length} users`);
    
    return res.status(200).json(combinedResults);
  } catch (error) {
    console.error('Error fetching weekly climbers:', error);
    return res.status(500).json({ message: 'Failed to fetch leaderboard data' });
  }
});

export default router;