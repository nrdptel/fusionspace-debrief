/** Why a dropped file is refused, said rather than left as a drop that does nothing.
 *
 *  Both surfaces that take a drop can be sitting in the column mapper, and both refuse a new
 *  file there for the same reason — taking it would discard the columns the flyer is part-way
 *  through. One sentence, in one place, so the two can't come to say it differently.
 */
export const MAPPING_BUSY =
  'Finish or cancel this column mapping first — taking a new file now would discard it.';
