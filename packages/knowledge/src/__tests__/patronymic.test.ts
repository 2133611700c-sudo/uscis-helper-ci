/**
 * Patronymic engine tests — ground truth from the project's REAL document set
 * (test-fixtures/real-docs/): birth cert (Ivanenko), marriage cert
 * (Zastavnyi/Kovshirina), 1939 Kharkiv (Borodavka). Multiple distinct people.
 */
import {
  isValidPatronymic,
  generatePatronymic,
  reconcilePatronymic,
} from '../patronymic'

let pass = 0
let fail = 0
function check(desc: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) { pass++; console.log(`  ✓ ${desc}`) }
  else { fail++; console.log(`  ✗ ${desc}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`) }
}

console.log('generatePatronymic — regular + exceptions (ground truth from docs)')
check('Юрій → M Юрійович', generatePatronymic('Юрій', 'M').value, 'Юрійович')
check('Юрій → F Юріївна',  generatePatronymic('Юрій', 'F').value, 'Юріївна')
check('Андрій → M Андрійович', generatePatronymic('Андрій', 'M').value, 'Андрійович')
check('Іван → M Іванович',     generatePatronymic('Іван', 'M').value, 'Іванович')   // marriage cert
check('Іван → F Іванівна',     generatePatronymic('Іван', 'F').value, 'Іванівна')
check('Тит → M Титович',       generatePatronymic('Тит', 'M').value, 'Титович')     // 1939 cert
check('Степан → F Степанівна', generatePatronymic('Степан', 'F').value, 'Степанівна') // birth cert mother
check('Олександр → M',         generatePatronymic('Олександр', 'M').value, 'Олександрович')
check('Володимир → F',         generatePatronymic('Володимир', 'F').value, 'Володимирівна')
// exceptions table
check('Микола → F Миколаївна', generatePatronymic('Микола', 'F').value, 'Миколаївна') // marriage cert
check('Микола → M Миколайович',generatePatronymic('Микола', 'M').value, 'Миколайович')
check('Петро → M Петрович',    generatePatronymic('Петро', 'M').value, 'Петрович')
check('Ілля → M Ілліч',        generatePatronymic('Ілля', 'M').value, 'Ілліч')
// not safely derivable → empty + unresolved (we DON'T guess)
check('unknown -а vowel name → unresolved', generatePatronymic('Абдула', 'M').source, 'unresolved')

console.log('isValidPatronymic — reject the OCR fragment bug ("Yovych"/"ович")')
check('Петрович valid (M)',  isValidPatronymic('Петрович', 'M'), true)
check('Миколаївна valid (F)',  isValidPatronymic('Миколаївна', 'F'), true)
check('"ович" fragment rejected', isValidPatronymic('ович', 'M'), false)   // the KI bug
check('"Yovych" latin rejected',  isValidPatronymic('Yovych', 'M'), false) // the KI bug
check('digits rejected',          isValidPatronymic('Петр0вич', 'M'), false)
check('empty rejected',           isValidPatronymic('', 'M'), false)

console.log('reconcilePatronymic — Chief Engineer entry point')
check('valid read kept, no review', reconcilePatronymic('Петрович', 'Іван', 'M'),
  { value: 'Петрович', source: 'read_valid', review_required: false, reason: 'read is complete and well-formed' })
check('fragment "ович" → reconstructed from given name', reconcilePatronymic('ович', 'Іван', 'M').value, 'Іванович')
check('fragment reconstructed flags review', reconcilePatronymic('ович', 'Іван', 'M').review_required, true)
check('no read + known name → reconstructed', reconcilePatronymic(null, 'Іван', 'F').value, 'Іванівна')
check('exception read_valid wins over generate', reconcilePatronymic('Миколаївна', 'Микола', 'F').source, 'read_valid')
check('nothing derivable → empty + review', reconcilePatronymic('Yovych', '', 'M'),
  { value: '', source: 'unresolved', review_required: true, reason: 'could not validate read nor derive from given name' })

console.log(`\npatronymic: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
