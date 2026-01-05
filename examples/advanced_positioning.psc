# Advanced Positioning Example
#
# This example demonstrates the advanced positioning features in PlanScript:
# - Explicit edge alignment: align my <edge> with <room>.<edge>
# - Auto dimensions: rect size (width, auto) or rect size (auto, height)
# - Extend directive: extend from <room>.<edge> to <room>.<edge>
# - Fill between rooms: fill between <room1> and <room2>
#
# Floor Plan: Small house with central hallway connecting wings
#
#     NORTH
#     +--------+     +--------+
#     | Master |     | Bed 2  |
#     +--------+     +--------+
#     | Bath   |     | Closet |
#     +---+----+-----+----+---+
#         |   Hallway    |
#     +---+--------------+---+
#     |      Living          |
#     +----------------------+
#     SOUTH
#

units m

defaults {
  door_width 0.9
  window_width 1.5
}

plan "Advanced Positioning Demo" {
  footprint rect (0, 0) (14, 16)

  # ============================================
  # MAIN ROOMS - Define the structure
  # ============================================

  # Living room - large open space at south
  room living {
    rect (1, 1) (13, 6)
    label "Living Room"
  }

  # Master suite - northwest corner
  room master {
    rect (1, 10) (5, 15)
    label "Master Bedroom"
  }

  # Master bathroom - uses explicit edge alignment
  # This demonstrates: align my <edge> with <room>.<edge>
  room master_bath {
    rect size (4, 3)
    attach south_of master
    align my left with master.left   # Left edges align precisely
    gap 0
    label "Master Bath"
  }

  # Bedroom 2 - northeast corner  
  room bedroom2 {
    rect (9, 10) (13, 15)
    label "Bedroom 2"
  }

  # Closet for bedroom 2 - demonstrates explicit alignment
  room closet2 {
    rect size (4, 3)
    attach south_of bedroom2
    align my right with bedroom2.right  # Right edges align precisely
    gap 0
    label "Closet"
  }

  # ============================================
  # HALLWAY - Using fill between rooms
  # ============================================
  
  # The hallway fills the vertical gap between living and the bedrooms
  # 'fill between' automatically detects the gap and fills it
  room hallway {
    fill between living and master_bath
    label "Hallway"
  }

  # ============================================
  # CONNECTING CORRIDOR - Using auto dimensions
  # ============================================

  # This corridor uses auto width - it will span the gap between 
  # master_bath and closet2, demonstrating the extend directive
  room corridor {
    rect size (auto, 3)
    attach north_of hallway
    align my left with master_bath.right
    extend from master_bath.right to closet2.left
    gap 0
    label "Corridor"
  }

  # ============================================
  # DOORS
  # ============================================

  # Front door (on living room south wall)
  opening door d_front {
    on living.edge south
    at 50%
    width 1.0
  }

  # Living to hallway
  opening door d_living_hall {
    between living and hallway
    on shared_edge
    at 50%
    width 1.5
  }

  # Hallway to master bath
  opening door d_hall_mbath {
    between hallway and master_bath
    on shared_edge
    at 50%
    width 0.8
  }

  # Master bath to master bedroom
  opening door d_mbath_master {
    between master_bath and master
    on shared_edge
    at 50%
    width 0.8
  }

  # Hallway to closet2
  opening door d_hall_closet {
    between hallway and closet2
    on shared_edge
    at 50%
    width 0.8
  }

  # Closet to bedroom2
  opening door d_closet_bed2 {
    between closet2 and bedroom2
    on shared_edge
    at 50%
    width 0.8
  }

  # Corridor connections
  opening door d_corr_mbath {
    between corridor and master_bath
    on shared_edge
    at 50%
  }

  opening door d_corr_closet {
    between corridor and closet2
    on shared_edge
    at 50%
  }

  # ============================================
  # WINDOWS
  # ============================================

  # Living room - large windows
  opening window w_living_s {
    on living.edge south
    at 3.0
    width 3.0
  }

  opening window w_living_s2 {
    on living.edge south
    at 9.0
    width 3.0
  }

  # Master bedroom
  opening window w_master_n {
    on master.edge north
    at 2.0
    width 2.5
  }

  opening window w_master_w {
    on master.edge west
    at 2.5
    width 2.0
  }

  # Bedroom 2
  opening window w_bed2_n {
    on bedroom2.edge north
    at 2.0
    width 2.5
  }

  opening window w_bed2_e {
    on bedroom2.edge east
    at 2.5
    width 2.0
  }

  # Master bath (small, high window)
  opening window w_mbath {
    on master_bath.edge west
    at 2.0
    width 1.0
    sill 1.5
  }

  # ============================================
  # VALIDATION
  # ============================================

  assert no_overlap rooms
  assert inside footprint all_rooms
  assert min_room_area master >= 18
  assert min_room_area living >= 50
  assert min_room_area bedroom2 >= 18
}
